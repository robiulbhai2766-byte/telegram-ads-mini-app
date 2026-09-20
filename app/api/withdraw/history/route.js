import { NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

function verifyTelegramInitData(initData, botToken) {
  if (!initData || !botToken) return null;

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");

  if (!hash) return null;

  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = crypto
    .createHmac("sha256", "WebAppData")
    .update(botToken)
    .digest();

  const calculatedHash = crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  if (
    calculatedHash.length !== hash.length ||
    !crypto.timingSafeEqual(
      Buffer.from(calculatedHash),
      Buffer.from(hash)
    )
  ) {
    return null;
  }

  const userRaw = params.get("user");

  if (!userRaw) return null;

  try {
    return JSON.parse(userRaw);
  } catch {
    return null;
  }
}

export async function GET(request) {
  try {
    const initData =
      request.headers.get(
        "x-telegram-init-data"
      );

    if (!initData) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Telegram authentication required."
        },
        { status: 401 }
      );
    }

    const botToken =
      process.env.TELEGRAM_BOT_TOKEN;

    const telegramUser =
      verifyTelegramInitData(
        initData,
        botToken
      );

    if (!telegramUser?.id) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Invalid Telegram authentication."
        },
        { status: 401 }
      );
    }

    const telegramId =
      Number(telegramUser.id);

    const {
      data: withdrawals,
      error
    } = await supabaseAdmin
      .from("withdrawals")
      .select(
        `
        id,
        amount,
        method,
        account_number,
        status,
        fee_amount,
        net_amount,
        currency,
        network,
        transaction_id,
        payment_reference,
        failure_reason,
        created_at,
        processed_at,
        paid_at
        `
      )
      .eq(
        "telegram_id",
        telegramId
      )
      .order(
        "created_at",
        {
          ascending: false
        }
      )
      .limit(50);

    if (error) {
      console.error(
        "Withdrawal history error:",
        error
      );

      return NextResponse.json(
        {
          success: false,
          message:
            "Unable to load withdrawal history."
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      withdrawals:
        withdrawals || []
    });

  } catch (error) {
    console.error(
      "Withdrawal history API error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        message:
          "Internal server error."
      },
      { status: 500 }
    );
  }
}
