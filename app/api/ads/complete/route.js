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

    const { initData, sessionId } = body;

    if (!initData || !sessionId) {
      return NextResponse.json(
        {
          success: false,
          message: "Missing initData or sessionId."
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

    // Check Telegram auth timestamp
    const params = new URLSearchParams(initData);
    const authDate = Number(params.get("auth_date"));

    if (!authDate) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid authentication date."
        },
        { status: 401 }
      );
    }

    const now = Math.floor(Date.now() / 1000);

    if (authDate > now + 60) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid authentication time."
        },
        { status: 401 }
      );
    }

    // Telegram initData older than 24 hours is rejected
    if (now - authDate > 86400) {
      return NextResponse.json(
        {
          success: false,
          message: "Telegram session expired."
        },
        { status: 401 }
      );
    }

    // Check session
    const { data: session, error: sessionError } =
      await supabaseAdmin
        .from("ad_sessions")
        .select("*")
        .eq("id", sessionId)
        .eq("telegram_id", telegramId)
        .maybeSingle();

    if (sessionError) {
      console.error("Session lookup error:", sessionError);

      return NextResponse.json(
        {
          success: false,
          message: "Unable to verify ad session."
        },
        { status: 500 }
      );
    }

    if (!session) {
      return NextResponse.json(
        {
          success: false,
          message: "Ad session not found."
        },
        { status: 404 }
      );
    }

    // Check that session is still started
    if (session.status !== "started") {
      return NextResponse.json(
        {
          success: false,
          message: "This ad session has already been processed."
        },
        { status: 400 }
      );
    }

    // Minimum watch time
    const { data: settings, error: settingsError } =
      await supabaseAdmin
        .from("admin_settings")
        .select("min_watch_seconds")
        .eq("id", 1)
        .maybeSingle();

    if (settingsError) {
      console.error("Settings error:", settingsError);

      return NextResponse.json(
        {
          success: false,
          message: "Unable to load ad settings."
        },
        { status: 500 }
      );
    }

    const minWatchSeconds =
      Number(settings?.min_watch_seconds || 15);

    const startedAt = new Date(session.started_at).getTime();
    const elapsedSeconds =
      (Date.now() - startedAt) / 1000;

    if (elapsedSeconds < minWatchSeconds) {
      return NextResponse.json(
        {
          success: false,
          message: `Please watch the ad for at least ${minWatchSeconds} seconds.`
        },
        { status: 400 }
      );
    }

    // Check expiry
    if (
      new Date(session.expires_at).getTime() <
      Date.now()
    ) {
      await supabaseAdmin
        .from("ad_sessions")
        .update({
          status: "expired"
        })
        .eq("id", sessionId)
        .eq("status", "started");

      return NextResponse.json(
        {
          success: false,
          message: "Ad session expired."
        },
        { status: 400 }
      );
    }

    // Check blocked user
    const { data: user, error: userError } =
      await supabaseAdmin
        .from("users")
        .select("is_blocked")
        .eq("telegram_id", telegramId)
        .maybeSingle();

    if (userError || !user) {
      return NextResponse.json(
        {
          success: false,
          message: "User not found."
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

    // ==========================================
    // ATOMIC REWARD TRANSACTION
    // ==========================================

    const { data: result, error: rewardError } =
      await supabaseAdmin.rpc(
        "complete_ad_reward",
        {
          p_session_id: sessionId,
          p_telegram_id: telegramId
        }
      );

    if (rewardError) {
      console.error("Atomic reward error:", rewardError);

      return NextResponse.json(
        {
          success: false,
          message: "Reward transaction failed."
        },
        { status: 500 }
      );
    }

    const rewardResult = result?.[0];

    if (!rewardResult?.success) {
      return NextResponse.json(
        {
          success: false,
          message:
            rewardResult?.message ||
            "Reward could not be processed."
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Ad verified. You earned $" +
        Number(rewardResult.reward).toFixed(2),
      reward: Number(rewardResult.reward),
      balance: Number(rewardResult.new_balance)
    });

  } catch (error) {
    console.error("Complete ad error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Internal server error."
      },
      { status: 500 }
    );
  }
}
