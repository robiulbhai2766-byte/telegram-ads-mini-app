import { NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function verifyTelegramInitData(initData) {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");

  if (!hash) {
    return { valid: false };
  }

  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  if (!botToken) {
    return { valid: false };
  }

  const secretKey = crypto
    .createHmac("sha256", "WebAppData")
    .update(botToken)
    .digest();

  const calculatedHash = crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  return {
    valid: calculatedHash === hash,
    params
  };
}

export async function POST(request) {
  try {
    const body = await request.json();
    const initData = body?.initData;

    if (!initData) {
      return NextResponse.json(
        { success: false, message: "Telegram data missing" },
        { status: 400 }
      );
    }

    const result = verifyTelegramInitData(initData);

    if (!result.valid) {
      return NextResponse.json(
        { success: false, message: "Invalid Telegram data" },
        { status: 401 }
      );
    }

    const userJson = result.params.get("user");

    if (!userJson) {
      return NextResponse.json(
        { success: false, message: "Telegram user missing" },
        { status: 400 }
      );
    }

    const telegramUser = JSON.parse(userJson);

    const telegramId = Number(telegramUser.id);

    const referralCode = `TG${telegramId}`;

    const { data, error } = await supabase
      .from("users")
      .upsert(
        {
          telegram_id: telegramId,
          username: telegramUser.username || null,
          first_name: telegramUser.first_name || null,
          last_name: telegramUser.last_name || null,
          referral_code: referralCode
        },
        {
          onConflict: "telegram_id"
        }
      )
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      user: data
    });

  } catch (error) {
    return NextResponse.json(
      { success: false, message: "Server error" },
      { status: 500 }
    );
  }
}
