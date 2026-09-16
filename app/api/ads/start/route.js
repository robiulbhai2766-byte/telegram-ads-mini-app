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

  if (!receivedHash) {
    return null;
  }

  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  if (!botToken) {
    return null;
  }

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

  if (!authDate) {
    return null;
  }

  const age = Math.floor(Date.now() / 1000) - authDate;

  // Reject very old Telegram sessions.
  if (age > 86400 || age < -60) {
    return null;
  }

  const userData = params.get("user");

  if (!userData) {
    return null;
  }

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
    const requestedAdId = body?.adId;

    if (!initData) {
      return NextResponse.json(
        {
          success: false,
          message: "Telegram data missing"
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

    // Get settings
    const { data: settings, error: settingsError } =
      await supabase
        .from("admin_settings")
        .select(
          "max_daily_ads, ad_cooldown_seconds, user_ad_cooldown_minutes"
        )
        .eq("id", 1)
        .single();

    if (settingsError) {
      return NextResponse.json(
        {
          success: false,
          message: "Settings unavailable"
        },
        { status: 500 }
      );
    }

    const dailyLimit = settings.max_daily_ads;
    const cooldownSeconds = settings.ad_cooldown_seconds;
    const userCooldownMinutes =
      settings.user_ad_cooldown_minutes;

    // Check user
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("telegram_id, is_blocked")
      .eq("telegram_id", telegramId)
      .single();

    if (userError || !user) {
      return NextResponse.json(
        {
          success: false,
          message: "User is not registered"
        },
        { status: 403 }
      );
    }

    if (user.is_blocked) {
      return NextResponse.json(
        {
          success: false,
          message: "Your account is blocked"
        },
        { status: 403 }
      );
    }

    // Count today's completed views
    const { count: todayViews, error: countError } =
      await supabase
        .from("ad_views")
        .select("id", {
          count: "exact",
          head: true
        })
        .eq("telegram_id", telegramId)
        .gte(
          "watched_at",
          new Date(
            new Date().setHours(0, 0, 0, 0)
          ).toISOString()
        );

    if (countError) {
      return NextResponse.json(
        {
          success: false,
          message: "Unable to check daily limit"
        },
        { status: 500 }
      );
    }

    if ((todayViews || 0) >= dailyLimit) {
      await supabase.from("security_logs").insert({
        telegram_id: telegramId,
        event_type: "daily_limit_reached",
        details: `Daily ad limit: ${dailyLimit}`
      });

      return NextResponse.json({
        success: false,
        message: "Daily ad limit reached"
      });
    }

    // Check recent ad session
    const cooldownTime = new Date(
      Date.now() - cooldownSeconds * 1000
    ).toISOString();

    const { data: recentSession } = await supabase
      .from("ad_sessions")
      .select("id, started_at")
      .eq("telegram_id", telegramId)
      .gte("started_at", cooldownTime)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recentSession) {
      await supabase.from("security_logs").insert({
        telegram_id: telegramId,
        event_type: "cooldown_active",
        details: `Cooldown: ${cooldownSeconds} seconds`
      });

      return NextResponse.json({
        success: false,
        message: `Please wait ${cooldownSeconds} seconds`
      });
    }

    // User-level cooldown
    const userCooldownTime = new Date(
      Date.now() - userCooldownMinutes * 60 * 1000
    ).toISOString();

    const { data: recentCompleted } = await supabase
      .from("ad_views")
      .select("id, watched_at")
      .eq("telegram_id", telegramId)
      .gte("watched_at", userCooldownTime)
      .order("watched_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recentCompleted) {
      return NextResponse.json({
        success: false,
        message: `Please wait ${userCooldownMinutes} minutes before watching another rewarded ad`
      });
    }

    // Select active ad
    let adQuery = supabase
      .from("ads")
      .select("id, title, ad_url, image_url, reward")
      .eq("is_active", true);

    if (requestedAdId) {
      adQuery = adQuery.eq("id", requestedAdId);
    }

    const { data: ads, error: adError } =
      await adQuery.limit(1);

    if (adError || !ads?.length) {
      return NextResponse.json({
        success: false,
        message: "No advertisement available"
      });
    }

    const ad = ads[0];

    // Create secure session
    const expiresAt = new Date(
      Date.now() + 10 * 60 * 1000
    ).toISOString();

    const { data: session, error: sessionError } =
      await supabase
        .from("ad_sessions")
        .insert({
          telegram_id: telegramId,
          ad_id: ad.id,
          reward: ad.reward,
          status: "started",
          expires_at: expiresAt
        })
        .select("id, expires_at")
        .single();

    if (sessionError) {
      return NextResponse.json(
        {
          success: false,
          message: "Unable to start advertisement"
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      sessionId: session.id,
      ad: {
        id: ad.id,
        title: ad.title,
        url: ad.ad_url,
        image: ad.image_url
      },
      expiresAt: session.expires_at
    });

  } catch (error) {
    console.error("START_AD_ERROR", error);

    return NextResponse.json(
      {
        success: false,
        message: "Server error"
      },
      { status: 500 }
    );
  }
}
