import { NextResponse } from "next/server";

export async function GET(request) {
  try {
    const secret = request.headers.get("x-admin-channel-secret");

    if (
      !process.env.ADMIN_CHANNEL_SECRET ||
      secret !== process.env.ADMIN_CHANNEL_SECRET
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "Unauthorized."
        },
        { status: 401 }
      );
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;

    if (!botToken) {
      return NextResponse.json(
        {
          success: false,
          message: "TELEGRAM_BOT_TOKEN is not configured."
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
          message: "Telegram API request failed."
        },
        { status: 500 }
      );
    }

    const results = data.result || [];

    const channels = [];

    for (const update of results) {
      const message =
        update.channel_post ||
        update.edited_channel_post;

      if (!message?.chat) continue;

      if (message.chat.type === "channel") {
        channels.push({
          id: message.chat.id,
          title: message.chat.title,
          username: message.chat.username || null,
          type: message.chat.type
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
