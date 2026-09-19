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

/* =========================================================
   TELEGRAM INIT DATA VERIFICATION
========================================================= */

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

  if (!botToken) {
    console.error(
      "TELEGRAM_BOT_TOKEN is missing"
    );

    return null;
  }

  const secretKey = crypto
    .createHmac(
      "sha256",
      "WebAppData"
    )
    .update(botToken)
    .digest();

  const calculatedHash = crypto
    .createHmac(
      "sha256",
      secretKey
    )
    .update(dataCheckString)
    .digest("hex");

  if (
    receivedHash.length !==
    calculatedHash.length
  ) {
    return null;
  }

  try {
    if (
      !crypto.timingSafeEqual(
        Buffer.from(receivedHash),
        Buffer.from(calculatedHash)
      )
    ) {
      return null;
    }
  } catch {
    return null;
  }

  const authDate =
    Number(params.get("auth_date"));

  if (!Number.isInteger(authDate)) {
    return null;
  }

  const now =
    Math.floor(Date.now() / 1000);

  // Telegram data older than 24 hours
  if (
    now - authDate >
    86400
  ) {
    return null;
  }

  // Future timestamp protection
  if (
    authDate >
    now + 60
  ) {
    return null;
  }

  const userData =
    params.get("user");

  if (!userData) {
    return null;
  }

  try {
    return JSON.parse(userData);
  } catch {
    return null;
  }
}

/* =========================================================
   SECURITY LOG
========================================================= */

async function writeSecurityLog(
  telegramId,
  eventType,
  severity,
  message,
  request
) {
  try {
    await supabase
      .from("security_logs")
      .insert({
        telegram_id:
          telegramId,

        event_type:
          eventType,

        severity:
          severity,

        message:
          message,

        user_agent:
          request.headers.get(
            "user-agent"
          ) || null
      });
  } catch (error) {
    console.error(
      "SECURITY_LOG_ERROR",
      error
    );
  }
}

/* =========================================================
   START ADSGRAM REWARDED AD SESSION
========================================================= */

export async function POST(request) {
  try {
    const body =
      await request.json();

    const initData =
      body?.initData;

    const requestedAdId =
      body?.adId || null;

    /* =====================================================
       1. TELEGRAM AUTHENTICATION
    ===================================================== */

    if (!initData) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Telegram data missing."
        },
        { status: 400 }
      );
    }

    const telegramUser =
      verifyTelegramInitData(
        initData
      );

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
      !Number.isSafeInteger(
        telegramId
      ) ||
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

    /* =====================================================
       2. ADMIN SETTINGS
    ===================================================== */

    const {
      data: settings,
      error: settingsError
    } = await supabase
      .from("admin_settings")
      .select(
        `
        max_daily_ads,
        ad_cooldown_seconds,
        user_ad_cooldown_minutes,
        daily_reset_hours
        `
      )
      .eq(
        "id",
        1
      )
      .single();

    if (
      settingsError ||
      !settings
    ) {
      console.error(
        "SETTINGS_ERROR",
        settingsError
      );

      return NextResponse.json(
        {
          success: false,
          message:
            "Advertisement settings unavailable."
        },
        { status: 500 }
      );
    }

    const dailyLimit =
      Number(
        settings.max_daily_ads ?? 20
      );

    const cooldownSeconds =
      Number(
        settings.ad_cooldown_seconds ?? 30
      );

    const userCooldownMinutes =
      Number(
        settings.user_ad_cooldown_minutes ?? 5
      );

    const dailyResetHours =
      Number(
        settings.daily_reset_hours ?? 24
      );

    /* =====================================================
       3. VALIDATE SETTINGS
    ===================================================== */

    if (
      !Number.isInteger(
        dailyLimit
      ) ||
      dailyLimit < 1 ||
      dailyLimit > 10000
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Daily advertisement limit is invalid."
        },
        { status: 500 }
      );
    }

    if (
      !Number.isInteger(
        cooldownSeconds
      ) ||
      cooldownSeconds < 0 ||
      cooldownSeconds > 86400
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Advertisement cooldown setting is invalid."
        },
        { status: 500 }
      );
    }

    if (
      !Number.isInteger(
        userCooldownMinutes
      ) ||
      userCooldownMinutes < 0 ||
      userCooldownMinutes > 10080
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "User reward cooldown setting is invalid."
        },
        { status: 500 }
      );
    }

    if (
      !Number.isInteger(
        dailyResetHours
      ) ||
      dailyResetHours < 1 ||
      dailyResetHours > 168
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Daily reset hours setting is invalid."
        },
        { status: 500 }
      );
    }

    /* =====================================================
       4. CHECK USER ACCOUNT
    ===================================================== */

    const {
      data: user,
      error: userError
    } = await supabase
      .from("users")
      .select(
        "telegram_id, is_blocked"
      )
      .eq(
        "telegram_id",
        telegramId
      )
      .maybeSingle();

    if (userError) {
      console.error(
        "USER_LOOKUP_ERROR",
        userError
      );

      return NextResponse.json(
        {
          success: false,
          message:
            "Unable to check user account."
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

    /* =====================================================
       5. BLOCKED USER
    ===================================================== */

    if (
      user.is_blocked === true
    ) {
      await writeSecurityLog(
        telegramId,
        "blocked_user_ad_attempt",
        "high",
        "Blocked user attempted to start an advertisement.",
        request
      );

      return NextResponse.json(
        {
          success: false,
          message:
            "Your account is blocked."
        },
        { status: 403 }
      );
    }

    /* =====================================================
       6. CLEAN EXPIRED SESSIONS
    ===================================================== */

    await supabase
      .from("ad_sessions")
      .update({
        status: "expired"
      })
      .eq(
        "telegram_id",
        telegramId
      )
      .eq(
        "status",
        "started"
      )
      .lte(
        "expires_at",
        new Date().toISOString()
      );

    /* =====================================================
       7. ROLLING DAILY AD LIMIT
    ===================================================== */

    const resetWindowStart =
      new Date(
        Date.now() -
          dailyResetHours *
            60 *
            60 *
            1000
      ).toISOString();

    const {
      count: recentViews,
      error: countError
    } = await supabase
      .from("ad_views")
      .select(
        "id",
        {
          count: "exact",
          head: true
        }
      )
      .eq(
        "telegram_id",
        telegramId
      )
      .gte(
        "watched_at",
        resetWindowStart
      );

    if (countError) {
      console.error(
        "DAILY_LIMIT_ERROR",
        countError
      );

      return NextResponse.json(
        {
          success: false,
          message:
            "Unable to check advertisement limit."
        },
        { status: 500 }
      );
    }

    if (
      (recentViews || 0) >=
      dailyLimit
    ) {
      await writeSecurityLog(
        telegramId,
        "daily_limit_reached",
        "medium",
        `Ad limit reached: ${dailyLimit} ads within ${dailyResetHours} hours.`,
        request
      );

      return NextResponse.json({
        success: false,
        message:
          `Ad limit reached. Please try again after the ${dailyResetHours}-hour reset window.`
      });
    }

    /* =====================================================
       8. ACTIVE SESSION COOLDOWN
    ===================================================== */

    const cooldownTime =
      new Date(
        Date.now() -
          cooldownSeconds *
            1000
      ).toISOString();

    const {
      data: recentSession,
      error: recentError
    } = await supabase
      .from("ad_sessions")
      .select(
        "id, started_at, status, expires_at"
      )
      .eq(
        "telegram_id",
        telegramId
      )
      .eq(
        "status",
        "started"
      )
      .gte(
        "started_at",
        cooldownTime
      )
      .order(
        "started_at",
        {
          ascending: false
        }
      )
      .limit(1)
      .maybeSingle();

    if (recentError) {
      console.error(
        "SESSION_COOLDOWN_ERROR",
        recentError
      );

      return NextResponse.json(
        {
          success: false,
          message:
            "Unable to check ad session."
        },
        { status: 500 }
      );
    }

    if (recentSession) {
      await writeSecurityLog(
        telegramId,
        "active_ad_session",
        "low",
        `An active advertisement session already exists.`,
        request
      );

      return NextResponse.json({
        success: false,
        message:
          "An advertisement is already active. Please finish it first."
      });
    }

    /* =====================================================
       9. REWARDED AD COOLDOWN
    ===================================================== */

    if (
      userCooldownMinutes > 0
    ) {
      const userCooldownTime =
        new Date(
          Date.now() -
            userCooldownMinutes *
              60 *
              1000
        ).toISOString();

      const {
        data: recentCompleted,
        error: completedError
      } = await supabase
        .from("ad_views")
        .select(
          "id, watched_at"
        )
        .eq(
          "telegram_id",
          telegramId
        )
        .gte(
          "watched_at",
          userCooldownTime
        )
        .order(
          "watched_at",
          {
            ascending: false
          }
        )
        .limit(1)
        .maybeSingle();

      if (completedError) {
        console.error(
          "USER_COOLDOWN_ERROR",
          completedError
        );

        return NextResponse.json(
          {
            success: false,
            message:
              "Unable to check reward cooldown."
          },
          { status: 500 }
        );
      }

      if (recentCompleted) {
        return NextResponse.json({
          success: false,
          message:
            `Please wait ${userCooldownMinutes} minutes before watching another rewarded ad.`
        });
      }
    }

    /* =====================================================
       10. SELECT ACTIVE REWARD CONFIGURATION
       
       AdsGram handles the actual advertisement.

       Database "ads" row is used for:
       - ad_id
       - reward
       - active/inactive control

       ad_url is NOT required anymore.
    ===================================================== */

    let adQuery = supabase
      .from("ads")
      .select(
        `
        id,
        title,
        image_url,
        reward,
        daily_limit,
        is_active
        `
      )
      .eq(
        "is_active",
        true
      );

    if (requestedAdId) {
      adQuery =
        adQuery.eq(
          "id",
          requestedAdId
        );
    }

    const {
      data: ads,
      error: adError
    } = await adQuery
      .order(
        "id",
        {
          ascending: true
        }
      )
      .limit(1);

    if (adError) {
      console.error(
        "AD_LOOKUP_ERROR",
        adError
      );

      return NextResponse.json(
        {
          success: false,
          message:
            "Unable to load advertisement configuration."
        },
        { status: 500 }
      );
    }

    if (
      !ads ||
      ads.length === 0
    ) {
      return NextResponse.json({
        success: false,
        message:
          "No active advertisement available."
      });
    }

    const ad = ads[0];

    /* =====================================================
       11. VALIDATE REWARD
    ===================================================== */

    const reward =
      Number(ad.reward);

    if (
      !Number.isFinite(
        reward
      ) ||
      reward <= 0
    ) {
      await writeSecurityLog(
        telegramId,
        "invalid_ad_reward",
        "high",
        `Advertisement ${ad.id} has an invalid reward.`,
        request
      );

      return NextResponse.json(
        {
          success: false,
          message:
            "Advertisement reward is invalid."
        },
        { status: 500 }
      );
    }

    /* =====================================================
       12. CREATE SECURE SESSION
       
       Session expires after 10 minutes.
    ===================================================== */

    const startedAt =
      new Date();

    const expiresAt =
      new Date(
        startedAt.getTime() +
          10 * 60 * 1000
      );

    const {
      data: session,
      error: sessionError
    } = await supabase
      .from("ad_sessions")
      .insert({
        telegram_id:
          telegramId,

        ad_id:
          ad.id,

        reward:
          reward,

        status:
          "started",

        started_at:
          startedAt.toISOString(),

        expires_at:
          expiresAt.toISOString()
      })
      .select(
        "id, expires_at"
      )
      .single();

    if (sessionError) {
      console.error(
        "SESSION_CREATE_ERROR",
        sessionError
      );

      await writeSecurityLog(
        telegramId,
        "session_create_failed",
        "medium",
        sessionError.message ||
          "Unable to create ad session.",
        request
      );

      return NextResponse.json(
        {
          success: false,
          message:
            "Unable to start advertisement. Please try again."
        },
        { status: 500 }
      );
    }

    /* =====================================================
       13. SUCCESS
       
       IMPORTANT:
       No external ad_url is returned.
       AdsGram is opened by frontend.
    ===================================================== */

    return NextResponse.json({
      success: true,

      sessionId:
        session.id,

      ad: {
        id:
          ad.id,

        title:
          ad.title,

        image:
          ad.image_url,

        reward:
          reward
      },

      expiresAt:
        session.expires_at
    });

  } catch (error) {
    console.error(
      "START_AD_ERROR",
      error
    );

    return NextResponse.json(
      {
        success: false,
        message:
          "Server error while starting advertisement."
      },
      { status: 500 }
    );
  }
}
