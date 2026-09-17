import { NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

function verifyTelegramInitData(initData) {
  if (!initData) return null;

  const params = new URLSearchParams(initData);
  const receivedHash = params.get("hash");

  if (!receivedHash) return null;

  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const botToken =
    process.env.TELEGRAM_BOT_TOKEN;

  if (!botToken) return null;

  const secretKey = crypto
    .createHmac("sha256", "WebAppData")
    .update(botToken)
    .digest();

  const calculatedHash = crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  if (
    receivedHash.length !==
    calculatedHash.length
  ) {
    return null;
  }

  if (
    !crypto.timingSafeEqual(
      Buffer.from(receivedHash),
      Buffer.from(calculatedHash)
    )
  ) {
    return null;
  }

  const authDate = Number(
    params.get("auth_date")
  );

  if (!Number.isInteger(authDate)) {
    return null;
  }

  const now =
    Math.floor(Date.now() / 1000);

  if (now - authDate > 86400) {
    return null;
  }

  if (authDate > now + 60) {
    return null;
  }

  const userString =
    params.get("user");

  if (!userString) return null;

  try {
    return JSON.parse(userString);
  } catch {
    return null;
  }
}

export async function POST(request) {
  try {
    const body = await request.json();

    const initData =
      body?.initData;

    if (!initData) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Telegram authentication data is missing."
        },
        { status: 400 }
      );
    }

    const telegramUser =
      verifyTelegramInitData(initData);

    if (!telegramUser?.id) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Invalid or expired Telegram session."
        },
        { status: 401 }
      );
    }

    const telegramId =
      Number(telegramUser.id);

    if (
      !Number.isSafeInteger(telegramId) ||
      telegramId <= 0
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Invalid Telegram user ID."
        },
        { status: 400 }
      );
    }

    // Check user
    const { data: user, error: userError } =
      await supabase
        .from("users")
        .select(
          "telegram_id, balance, is_blocked"
        )
        .eq("telegram_id", telegramId)
        .maybeSingle();

    if (userError) {
      console.error(
        "DAILY_BONUS_USER_ERROR",
        userError
      );

      return NextResponse.json(
        {
          success: false,
          message:
            "Unable to check your account."
        },
        { status: 500 }
      );
    }

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          message:
            "User account is not registered."
        },
        { status: 403 }
      );
    }

    if (user.is_blocked === true) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Your account is blocked."
        },
        { status: 403 }
      );
    }

    // Atomic database reward
    const {
      data: result,
      error: bonusError
    } = await supabase.rpc(
      "claim_daily_bonus",
      {
        p_telegram_id: telegramId
      }
    );

    if (bonusError) {
      console.error(
        "DAILY_BONUS_RPC_ERROR",
        bonusError
      );

      return NextResponse.json(
        {
          success: false,
          message:
            "Unable to claim daily bonus."
        },
        { status: 500 }
      );
    }

    const bonusResult =
      Array.isArray(result)
        ? result[0]
        : result;

    if (!bonusResult) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Daily bonus response was invalid."
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success:
        Boolean(bonusResult.success),

      message:
        bonusResult.message,

      bonus:
        Number(bonusResult.bonus || 0),

      newBalance:
        Number(
          bonusResult.new_balance || 0
        )
    });

  } catch (error) {
    console.error(
      "DAILY_BONUS_ERROR",
      error
    );

    return NextResponse.json(
      {
        success: false,
        message:
          "Server error while claiming daily bonus."
      },
      { status: 500 }
    );
  }
}
