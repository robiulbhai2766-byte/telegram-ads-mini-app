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
          message: "Bot token is missing."
        },
        { status: 500 }
      );
    }

    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/getChat?chat_id=@AdsEarn67`,
      {
        cache: "no-store"
      }
    );

    const data = await response.json();

    if (!data.ok) {
      return NextResponse.json(
        {
          success: false,
          message:
            data.description ||
            "Telegram getChat failed."
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      channel: {
        id: data.result.id,
        title: data.result.title,
        username:
          data.result.username || null,
        type: data.result.type
      }
    });

  } catch (error) {
    console.error(
      "Telegram channel error:",
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
