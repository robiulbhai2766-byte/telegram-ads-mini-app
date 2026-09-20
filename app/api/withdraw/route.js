import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

function verifyTelegramInitData(initData) {
  try {
    if (!initData) {
      return { ok: false, message: "Telegram authorization missing." };
    }

    const params = new URLSearchParams(initData);

    const hash = params.get("hash");
    const authDate = Number(params.get("auth_date"));
    const userRaw = params.get("user");

    if (!hash || !authDate || !userRaw) {
      return { ok: false, message: "Invalid Telegram authorization." };
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;

    if (!botToken) {
      return { ok: false, message: "Bot configuration error." };
    }

    const now = Math.floor(Date.now() / 1000);

    if (authDate > now + 60) {
      return { ok: false, message: "Invalid authorization time." };
    }

    if (now - authDate > 24 * 60 * 60) {
      return { ok: false, message: "Telegram authorization expired." };
    }

    const crypto = require("crypto");

    const dataCheckString = [...params.entries()]
      .filter(([key]) => key !== "hash")
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
      return { ok: false, message: "Telegram authorization failed." };
    }

    const telegramUser = JSON.parse(userRaw);

    if (!telegramUser.id) {
      return { ok: false, message: "Telegram user not found." };
    }

    return {
      ok: true,
      telegramId: Number(telegramUser.id)
    };
  } catch {
    return {
      ok: false,
      message: "Invalid Telegram authorization."
    };
  }
}

export async function POST(request) {
  try {
    const initData =
      request.headers.get("x-telegram-init-data") || "";

    const auth = verifyTelegramInitData(initData);

    if (!auth.ok) {
      return NextResponse.json(
        {
          success: false,
          message: auth.message
        },
        { status: 401 }
      );
    }

    const body = await request.json();

    const amount = Number(body.amount);
    const method = String(body.method || "")
      .trim()
      .toLowerCase();

    const accountNumber = String(
      body.account_number || ""
    ).trim();

    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid withdrawal amount."
        },
        { status: 400 }
      );
    }

    if (
      ![
        "bkash",
        "binance_uid",
        "binance_bep20"
      ].includes(method)
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid payment method."
        },
        { status: 400 }
      );
    }

    if (accountNumber.length < 3) {
      return NextResponse.json(
        {
          success: false,
          message: "Payment account is required."
        },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin.rpc(
      "request_withdrawal",
      {
        p_telegram_id: auth.telegramId,
        p_amount: amount,
        p_method: method,
        p_account_number: accountNumber
      }
    );

    if (error) {
      console.error("Withdrawal RPC error:", error);

      return NextResponse.json(
        {
          success: false,
          message: "Withdrawal request failed."
        },
        { status: 500 }
      );
    }

    if (!data || data.success !== true) {
      return NextResponse.json(
        {
          success: false,
          message:
            data?.message ||
            "Withdrawal request failed."
        },
        { status: 400 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Withdrawal API error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Server error."
      },
      { status: 500 }
    );
  }
}
