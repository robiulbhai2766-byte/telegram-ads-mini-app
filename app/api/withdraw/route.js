import { NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

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

export async function POST(request) {
  try {
    const body = await request.json();

    const {
      initData,
      amount,
      method,
      accountNumber
    } = body;

    if (
      !initData ||
      !amount ||
      !method ||
      !accountNumber
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "All withdrawal fields are required."
        },
        { status: 400 }
      );
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;

    const telegramUser = verifyTelegramInitData(
      initData,
      botToken
    );

    if (!telegramUser?.id) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid Telegram authentication."
        },
        { status: 401 }
      );
    }

    const telegramId = Number(telegramUser.id);

    const withdrawalAmount = Number(amount);

    if (
      !Number.isFinite(withdrawalAmount) ||
      withdrawalAmount <= 0
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid withdrawal amount."
        },
        { status: 400 }
      );
    }

    // Minimum withdrawal
    const minimumWithdrawal = 1;

    if (withdrawalAmount < minimumWithdrawal) {
      return NextResponse.json(
        {
          success: false,
          message:
            `Minimum withdrawal is $${minimumWithdrawal.toFixed(2)}.`
        },
        { status: 400 }
      );
    }

    // Clean method/account
    const cleanMethod = String(method)
      .trim()
      .slice(0, 30);

    const cleanAccountNumber = String(accountNumber)
      .trim()
      .slice(0, 100);

    if (!cleanMethod || !cleanAccountNumber) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid withdrawal information."
        },
        { status: 400 }
      );
    }

    // ==========================================
    // GET USER
    // ==========================================

    const { data: user, error: userError } =
      await supabaseAdmin
        .from("users")
        .select(
          "telegram_id, balance, is_blocked"
        )
        .eq("telegram_id", telegramId)
        .maybeSingle();

    if (userError) {
      console.error(
        "User lookup error:",
        userError
      );

      return NextResponse.json(
        {
          success: false,
          message: "Unable to verify account."
        },
        { status: 500 }
      );
    }

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          message: "User account not found."
        },
        { status: 404 }
      );
    }

    if (user.is_blocked) {
      return NextResponse.json(
        {
          success: false,
          message: "Your account is blocked."
        },
        { status: 403 }
      );
    }

    const currentBalance = Number(
      user.balance || 0
    );

    if (withdrawalAmount > currentBalance) {
      return NextResponse.json(
        {
          success: false,
          message: "Insufficient balance."
        },
        { status: 400 }
      );
    }

    // ==========================================
    // CHECK EXISTING PENDING WITHDRAWALS
    // ==========================================

    const { data: pendingWithdrawal } =
      await supabaseAdmin
        .from("withdrawals")
        .select("id")
        .eq("telegram_id", telegramId)
        .eq("status", "pending")
        .limit(1)
        .maybeSingle();

    if (pendingWithdrawal) {
      return NextResponse.json(
        {
          success: false,
          message:
            "You already have a pending withdrawal."
        },
        { status: 400 }
      );
    }

    // ==========================================
    // CREATE WITHDRAWAL
    // ==========================================

    const withdrawalId =
      crypto.randomUUID();

    const { data: withdrawal, error: withdrawalError } =
      await supabaseAdmin
        .from("withdrawals")
        .insert({
          id: withdrawalId,
          telegram_id: telegramId,
          amount: withdrawalAmount,
          method: cleanMethod,
          account_number: cleanAccountNumber,
          status: "pending"
        })
        .select()
        .single();

    if (withdrawalError) {
      console.error(
        "Withdrawal insert error:",
        withdrawalError
      );

      return NextResponse.json(
        {
          success: false,
          message:
            "Unable to create withdrawal request."
        },
        { status: 500 }
      );
    }

    // ==========================================
    // DEDUCT BALANCE
    // ==========================================

    const newBalance =
      currentBalance - withdrawalAmount;

    const { error: balanceError } =
      await supabaseAdmin
        .from("users")
        .update({
          balance: newBalance,
          total_withdraw:
            Number(user.total_withdraw || 0) +
            withdrawalAmount
        })
        .eq("telegram_id", telegramId)
        .eq("balance", currentBalance);

    if (balanceError) {
      console.error(
        "Balance update error:",
        balanceError
      );

      // Rollback withdrawal request
      await supabaseAdmin
        .from("withdrawals")
        .delete()
        .eq("id", withdrawalId);

      return NextResponse.json(
        {
          success: false,
          message:
            "Unable to update balance."
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message:
        "Withdrawal request submitted successfully.",
      withdrawal: {
        id: withdrawal.id,
        amount: Number(withdrawal.amount),
        method: withdrawal.method,
        status: withdrawal.status,
        created_at: withdrawal.created_at
      },
      balance: Number(newBalance)
    });

  } catch (error) {
    console.error(
      "Withdrawal API error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        message: "Internal server error."
      },
      { status: 500 }
    );
  }
}
