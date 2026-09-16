import { NextResponse } from "next/server";
import {
  verifyAdminToken,
  COOKIE_NAME
} from "../../../../lib/adminAuth";

export async function GET(request) {
  try {
    const token =
      request.cookies.get(COOKIE_NAME)?.value;

    if (!verifyAdminToken(token)) {
      return NextResponse.json(
        {
          success: false,
          message: "Admin authentication required."
        },
        { status: 401 }
      );
    }

    const botToken =
      process.env.TELEGRAM_BOT_TOKEN;

    if (!botToken) {
      return NextResponse.json(
        {
          success: false,
          message:
            "TELEGRAM_BOT_TOKEN is not configured."
        },
        { status: 500 }
      );
    }

    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/getUpdates`
    );

    const data = await response.json();

    if (!data.ok) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Telegram API request failed."
        },
        { status: 500 }
      );
    }

    const channels = [];

    for (const update of data.result || []) {
      const message =
        update.channel_post ||
        update.edited_channel_post;

      if (!message?.chat) continue;

      if (message.chat.type === "channel") {
        channels.push({
          id: message.chat.id,
          title: message.chat.title,
          username:
            message.chat.username || null
        });
      }
    }

    const uniqueChannels = [
      ...new Map(
        channels.map((channel) => [
          String(channel.id),
          channel
        ])
      ).values()
    ];

    return NextResponse.json({
      success: true,
      channels: uniqueChannels
    });

  } catch (error) {
    console.error(
      "Telegram channel lookup error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        message: "Server error."
      },
      { status: 500 }
    );
  }
}
