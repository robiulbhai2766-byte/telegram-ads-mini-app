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

    // ==========================================
    // BASIC VALIDATION
    // ==========================================

    if (
      !initData ||
      amount === undefined ||
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
          message: "Invalid Telegram authentication."
        },
        { status: 401 }
      );
    }

    const telegramId =
      Number(telegramUser.id);

    const withdrawalAmount =
      Number(amount);

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

    // ==========================================
    // NORMALIZE METHOD
    // ==========================================

    const cleanMethod =
      String(method)
        .trim()
        .toLowerCase();

    const allowedMethods = [
      "bkash",
      "binance_uid",
      "binance_bep20"
    ];

    if (!allowedMethods.includes(cleanMethod)) {
      return NextResponse.json(
        {
          success: false,
          message: "Unsupported payment method."
        },
        { status: 400 }
      );
    }

    const cleanAccountNumber =
      String(accountNumber)
        .trim()
        .slice(0, 150);

    if (!cleanAccountNumber) {
      return NextResponse.json(
        {
          success: false,
          message: "Payment account is required."
        },
        { status: 400 }
      );
    }

    // ==========================================
    // LOAD PAYMENT SETTINGS
    // ==========================================

    const {
      data: settings,
      error: settingsError
    } = await supabaseAdmin
      .from("payment_settings")
      .select("*")
      .eq("id", 1)
      .maybeSingle();

    if (settingsError) {
      console.error(
        "Payment settings error:",
        settingsError
      );

      return NextResponse.json(
        {
          success: false,
          message:
            "Unable to load payment settings."
        },
        { status: 500 }
      );
    }

    if (!settings) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Payment system is not configured."
        },
        { status: 503 }
      );
    }

    // ==========================================
    // CHECK METHOD ENABLED
    // ==========================================

    if (
      cleanMethod === "bkash" &&
      !settings.bkash_enabled
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "bKash withdrawal is disabled."
        },
        { status: 400 }
      );
    }

    if (
      cleanMethod === "binance_uid" &&
      !settings.binance_uid_enabled
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Binance UID withdrawal is disabled."
        },
        { status: 400 }
      );
    }

    if (
      cleanMethod === "binance_bep20" &&
      !settings.binance_bep20_enabled
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Binance BEP20 withdrawal is disabled."
        },
        { status: 400 }
      );
    }

    // ==========================================
    // MINIMUM WITHDRAWAL
    // ==========================================

    const minimumWithdrawal =
      Number(
        settings.minimum_withdrawal_usd || 1
      );

    if (
      withdrawalAmount <
      minimumWithdrawal
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            `Minimum withdrawal is $${minimumWithdrawal.toFixed(2)}.`
        },
        { status: 400 }
      );
    }

    // ==========================================
    // ONE REQUEST PER DAY
    // ==========================================

    const { data: dailyRequests, error: dailyError } =
      await supabaseAdmin
        .from("withdrawals")
        .select("id, created_at")
        .eq("telegram_id", telegramId)
        .gte(
          "created_at",
          new Date(
            new Date().setHours(0, 0, 0, 0)
          ).toISOString()
        )
        .limit(1);

    if (dailyError) {
      console.error(
        "Daily withdrawal check error:",
        dailyError
      );

      return NextResponse.json(
        {
          success: false,
          message:
            "Unable to check withdrawal limit."
        },
        { status: 500 }
      );
    }

    const dailyLimit =
      Number(
        settings.daily_withdrawal_limit || 1
      );

    if (
      dailyRequests &&
      dailyRequests.length >= dailyLimit
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "You can submit only one withdrawal request per day."
        },
        { status: 429 }
      );
    }

    // ==========================================
    // GET USER
    // ==========================================

    const {
      data: user,
      error: userError
    } = await supabaseAdmin
      .from("users")
      .select(
        "telegram_id, balance, is_blocked, total_withdraw"
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
          message:
            "Unable to verify account."
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

    const currentBalance =
      Number(user.balance || 0);

    if (
      withdrawalAmount >
      currentBalance
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "Insufficient balance."
        },
        { status: 400 }
      );
    }

    // ==========================================
    // CALCULATE FEE
    // ==========================================

    let feePercent = 0;

    if (cleanMethod === "bkash") {
      feePercent =
        Number(
          settings.bkash_fee_percent || 0
        );
    }

    if (
      cleanMethod === "binance_uid"
    ) {
      feePercent =
        Number(
          settings.binance_uid_fee_percent || 0
        );
    }

    if (
      cleanMethod === "binance_bep20"
    ) {
      feePercent =
        Number(
          settings.binance_bep20_fee_percent || 0
        );
    }

    if (
      !Number.isFinite(feePercent) ||
      feePercent < 0 ||
      feePercent > 100
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Invalid payment fee configuration."
        },
        { status: 500 }
      );
    }

    const feeAmount =
      Number(
        (
          withdrawalAmount *
          feePercent /
          100
        ).toFixed(8)
      );

    const netAmount =
      Number(
        (
          withdrawalAmount -
          feeAmount
        ).toFixed(8)
      );

    if (netAmount <= 0) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Withdrawal amount is too small after fee."
        },
        { status: 400 }
      );
    }

    // ==========================================
    // BKASH USD → BDT
    // ==========================================

    let payoutCurrency = "USD";
    let payoutNetwork = null;
    let payoutAmount = netAmount;

    if (cleanMethod === "bkash") {
      const bkashRate =
        Number(
          settings.bkash_usd_rate || 110
        );

      if (
        !Number.isFinite(bkashRate) ||
        bkashRate <= 0
      ) {
        return NextResponse.json(
          {
            success: false,
            message:
              "Invalid bKash exchange rate."
          },
          { status: 500 }
        );
      }

      payoutCurrency = "BDT";

      payoutAmount =
        Number(
          (
            netAmount *
            bkashRate
          ).toFixed(2)
        );
    }

    // ==========================================
    // BINANCE BEP20
    // ==========================================

    if (
      cleanMethod === "binance_bep20"
    ) {
      payoutCurrency = "USDT";
      payoutNetwork = "BEP20";
    }

    // Binance UID remains USD/USDT
    if (
      cleanMethod === "binance_uid"
    ) {
      payoutCurrency = "USDT";
    }

    // ==========================================
    // CREATE WITHDRAWAL
    // ==========================================

    const withdrawalId =
      crypto.randomUUID();

    const { data: withdrawal, error: insertError } =
      await supabaseAdmin
        .from("withdrawals")
        .insert({
          id: withdrawalId,
          telegram_id: telegramId,
          amount: withdrawalAmount,
          method: cleanMethod,
          account_number:
            cleanAccountNumber,
          status: "pending",
          fee_amount: feeAmount,
          net_amount: netAmount,
          currency: payoutCurrency,
          network: payoutNetwork,
          payment_reference:
            `WD-${Date.now()}-${telegramId}`
        })
        .select()
        .single();

    if (insertError) {
      console.error(
        "Withdrawal insert error:",
        insertError
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
    // DEDUCT USER BALANCE
    // ==========================================

    const newBalance =
      Number(
        (
          currentBalance -
          withdrawalAmount
        ).toFixed(8)
      );

    const {
      error: balanceError
    } = await supabaseAdmin
      .from("users")
      .update({
        balance: newBalance,
        total_withdraw:
          Number(
            user.total_withdraw || 0
          ) + withdrawalAmount
      })
      .eq("telegram_id", telegramId)
      .eq("balance", currentBalance);

    if (balanceError) {
      console.error(
        "Balance update error:",
        balanceError
      );

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
        requestedAmount:
          withdrawalAmount,
        feeAmount,
        netAmount,
        payoutAmount,
        currency: payoutCurrency,
        network: payoutNetwork,
        method: cleanMethod,
        status: "pending",
        createdAt:
          withdrawal.created_at
      },

      balance: newBalance
    });

  } catch (error) {
    console.error(
      "Withdrawal API error:",
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
