import { NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function verifyTelegramInitData(initData) {
  const params = new URLSearchParams(initData);
  const receivedHash = params.get("hash");

  if (!receivedHash) return null;

  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const botToken = process.env.TELEGRAM_BOT_TOKEN;

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
    calculatedHash.length !== receivedHash.length ||
    !crypto.timingSafeEqual(
      Buffer.from(calculatedHash),
      Buffer.from(receivedHash)
    )
  ) {
    return null;
  }

  const authDate = Number(params.get("auth_date"));

  if (!authDate) return null;

  const age = Math.floor(Date.now() / 1000) - authDate;

  if (age > 86400 || age < -60) return null;

  const userData = params.get("user");

  if (!userData) return null;

  try {
    return JSON.parse(userData);
  } catch {
    return null;
  }
}

export async function POST(request) {
  try {
    const body = await request.json();

    const initData = body?.initData;
    const sessionId = body?.sessionId;

    if (!initData || !sessionId) {
      return NextResponse.json(
        {
          success: false,
          message: "Required data missing"
        },
        { status: 400 }
      );
    }

    const telegramUser = verifyTelegramInitData(initData);

    if (!telegramUser?.id) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid Telegram session"
        },
        { status: 401 }
      );
    }

    const telegramId = Number(telegramUser.id);

    // Get session
    const { data: session, error: sessionError } =
      await supabase
        .from("ad_sessions")
        .select(
          "id, telegram_id, ad_id, reward, status, started_at, expires_at"
        )
        .eq("id", sessionId)
        .single();

    if (sessionError || !session) {
      return NextResponse.json(
        {
          success: false,
          message: "Ad session not found"
        },
        { status: 404 }
      );
    }

    // Session must belong to Telegram user
    if (Number(session.telegram_id) !== telegramId) {
      await supabase.from("security_logs").insert({
        telegram_id: telegramId,
        event_type: "invalid_session",
        details: "Session/user mismatch"
      });

      return NextResponse.json(
        {
          success: false,
          message: "Invalid ad session"
        },
        { status: 403 }
      );
    }

    // Session can only be completed once
    if (session.status !== "started") {
      await supabase.from("security_logs").insert({
        telegram_id: telegramId,
        event_type: "duplicate_completion",
        details: `Session status: ${session.status}`
      });

      return NextResponse.json({
        success: false,
        message: "This advertisement has already been processed"
      });
    }

    // Check expiry
    if (new Date(session.expires_at).getTime() < Date.now()) {
      await supabase
        .from("ad_sessions")
        .update({
          status: "expired"
        })
        .eq("id", session.id);

      return NextResponse.json({
        success: false,
        message: "Ad session expired. Please start again."
      });
    }

    // Minimum server-side watch duration
    const { data: settings } = await supabase
      .from("admin_settings")
      .select("min_watch_seconds")
      .eq("id", 1)
      .single();

    const minimumWatchSeconds =
      settings?.min_watch_seconds || 15;

    const elapsedSeconds =
      (Date.now() -
        new Date(session.started_at).getTime()) /
      1000;

    if (elapsedSeconds < minimumWatchSeconds) {
      await supabase
        .from("ad_sessions")
        .update({
          status: "rejected"
        })
        .eq("id", session.id);

      await supabase.from("security_logs").insert({
        telegram_id: telegramId,
        event_type: "incomplete_ad",
        details: `Watched ${Math.floor(
          elapsedSeconds
        )} seconds; required ${minimumWatchSeconds}`
      });

      return NextResponse.json({
        success: false,
        message: "Advertisement was not completed"
      });
    }

    // Check user
    const { data: user, error: userError } =
      await supabase
        .from("users")
        .select("telegram_id, balance, total_earned, is_blocked")
        .eq("telegram_id", telegramId)
        .single();

    if (userError || !user) {
      return NextResponse.json(
        {
          success: false,
          message: "User not found"
        },
        { status: 404 }
      );
    }

    if (user.is_blocked) {
      return NextResponse.json(
        {
          success: false,
          message: "Account blocked"
        },
        { status: 403 }
      );
    }

    // Mark session completed
    const { error: completeError } =
      await supabase
        .from("ad_sessions")
        .update({
          status: "completed",
          completed_at: new Date().toISOString()
        })
        .eq("id", session.id)
        .eq("status", "started");

    if (completeError) {
      return NextResponse.json(
        {
          success: false,
          message: "Completion failed"
        },
        { status: 500 }
      );
    }

    // Record view
    const { error: viewError } = await supabase
      .from("ad_views")
      .insert({
        telegram_id: telegramId,
        ad_id: session.ad_id,
        reward: session.reward
      });

    if (viewError) {
      return NextResponse.json(
        {
          success: false,
          message: "View recording failed"
        },
        { status: 500 }
      );
    }

    // Add earning
    const { error: earningError } = await supabase
      .from("earnings")
      .insert({
        telegram_id: telegramId,
        amount: session.reward,
        earning_type: "ad_watch",
        reference_id: session.id
      });

    if (earningError) {
      return NextResponse.json(
        {
          success: false,
          message: "Earning recording failed"
        },
        { status: 500 }
      );
    }

    // Update balance
    const newBalance =
      Number(user.balance || 0) +
      Number(session.reward || 0);

    const newTotalEarned =
      Number(user.total_earned || 0) +
      Number(session.reward || 0);

    const { error: balanceError } =
      await supabase
        .from("users")
        .update({
          balance: newBalance,
          total_earned: newTotalEarned
        })
        .eq("telegram_id", telegramId);

    if (balanceError) {
      return NextResponse.json(
        {
          success: false,
          message: "Balance update failed"
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Advertisement verified successfully",
      reward: Number(session.reward),
      balance: newBalance
    });

  } catch (error) {
    console.error("COMPLETE_AD_ERROR", error);

    return NextResponse.json(
      {
        success: false,
        message: "Server error"
      },
      { status: 500 }
    );
  }
}
