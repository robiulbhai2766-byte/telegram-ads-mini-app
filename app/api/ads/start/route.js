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

  if (receivedHash.length !== calculatedHash.length) {
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

  const authDate = Number(params.get("auth_date"));

  if (!Number.isInteger(authDate)) {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);

  if (now - authDate > 86400) {
    return null;
  }

  if (authDate > now + 60) {
    return null;
  }

  const userData = params.get("user");

  if (!userData) return null;

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
    await supabase.from("security_logs").insert({
      telegram_id: telegramId,
      event_type: eventType,
      severity,
      message,
      user_agent:
        request.headers.get("user-agent") || null
    });
  } catch (error) {
    console.error(
      "SECURITY_LOG_ERROR",
      error
    );
  }
}

/* =========================================================
   START AD
========================================================= */

export async function POST(request) {
  try {
    const body = await request.json();

    const initData = body?.initData;
    const requestedAdId = body?.adId || null;

    /* -----------------------------------------------------
       1. CHECK TELEGRAM DATA
    ----------------------------------------------------- */

    if (!initData) {
      return NextResponse.json(
        {
          success: false,
          message: "Telegram data missing."
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

    /* -----------------------------------------------------
       2. LOAD ADMIN SETTINGS
    ----------------------------------------------------- */

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
      .eq("id", 1)
      .single();

    if (settingsError || !settings) {
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

    const dailyLimit = Number(
      settings.max_daily_ads ?? 20
    );

    const cooldownSeconds = Number(
      settings.ad_cooldown_seconds ?? 30
    );

    const userCooldownMinutes = Number(
      settings.user_ad_cooldown_minutes ?? 5
    );

    const dailyResetHours = Number(
      settings.daily_reset_hours ?? 24
    );

    /* -----------------------------------------------------
       3. VALIDATE SETTINGS
    ----------------------------------------------------- */

    if (
      !Number.isInteger(dailyLimit) ||
      dailyLimit < 1
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
      !Number.isInteger(cooldownSeconds) ||
      cooldownSeconds < 0
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
      !Number.isInteger(userCooldownMinutes) ||
      userCooldownMinutes < 0
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
      !Number.isInteger(dailyResetHours) ||
      dailyResetHours < 1
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

    /* -----------------------------------------------------
       4. CHECK USER
    ----------------------------------------------------- */

    const {
      data: user,
      error: userError
    } = await supabase
      .from("users")
      .select(
        "telegram_id, is_blocked"
      )
      .eq("telegram_id", telegramId)
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

    /* -----------------------------------------------------
       5. BLOCKED USER CHECK
    ----------------------------------------------------- */

    if (user.is_blocked === true) {
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

    /* -----------------------------------------------------
       6. ROLLING AD LIMIT
       
       Example:
       Limit = 20
       Reset = 24 hours

       System checks completed ads from the
       previous 24 hours.

       When 20 ads are found, user must wait
       until older views leave the 24-hour window.
    ----------------------------------------------------- */

    const resetWindowStart = new Date(
      Date.now() -
        dailyResetHours * 60 * 60 * 1000
    ).toISOString();

    const {
      count: recentViews,
      error: countError
    } = await supabase
      .from("ad_views")
      .select("id", {
        count: "exact",
        head: true
      })
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

    if ((recentViews || 0) >= dailyLimit) {
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

    /* -----------------------------------------------------
       7. SHORT COOLDOWN
    ----------------------------------------------------- */

    const cooldownTime =
      new Date(
        Date.now() -
          cooldownSeconds * 1000
      ).toISOString();

    const {
      data: recentSession,
      error: recentError
    } = await supabase
      .from("ad_sessions")
      .select(
        "id, started_at, status"
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
        "cooldown_active",
        "low",
        `Ad cooldown active: ${cooldownSeconds} seconds.`,
        request
      );

      return NextResponse.json({
        success: false,
        message:
          `Please wait ${cooldownSeconds} seconds before starting another advertisement.`
      });
    }

    /* -----------------------------------------------------
       8. USER REWARDED-AD COOLDOWN
    ----------------------------------------------------- */

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

    /* -----------------------------------------------------
       9. SELECT ACTIVE AD
    ----------------------------------------------------- */

    let adQuery = supabase
      .from("ads")
      .select(
        `
        id,
        title,
        ad_url,
        image_url,
        reward,
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
    } = await adQuery.limit(1);

    if (adError) {
      console.error(
        "AD_LOOKUP_ERROR",
        adError
      );

      return NextResponse.json(
        {
          success: false,
          message:
            "Unable to load advertisement."
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

    /* -----------------------------------------------------
       10. VALIDATE AD
    ----------------------------------------------------- */

    if (!ad.ad_url) {
      await writeSecurityLog(
        telegramId,
        "invalid_ad_configuration",
        "high",
        `Advertisement ${ad.id} has no ad URL.`,
        request
      );

      return NextResponse.json(
        {
          success: false,
          message:
            "Advertisement is not configured correctly."
        },
        { status: 500 }
      );
    }

    const reward =
      Number(ad.reward);

    if (
      !Number.isFinite(reward) ||
      reward <= 0
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Advertisement reward is invalid."
        },
        { status: 500 }
      );
    }

    /* -----------------------------------------------------
       11. CREATE SECURE AD SESSION
    ----------------------------------------------------- */

    const expiresAt =
      new Date(
        Date.now() +
          10 * 60 * 1000
      ).toISOString();

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

        reward,

        status:
          "started",

        started_at:
          new Date().toISOString(),

        expires_at:
          expiresAt
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

      /* -----------------------------------------------
         UNIQUE ACTIVE SESSION PROTECTION
      ------------------------------------------------ */

      if (
        sessionError.code ===
        "23505"
      ) {
        await writeSecurityLog(
          telegramId,
          "duplicate_active_session",
          "medium",
          "An active advertisement session already exists.",
          request
        );

        return NextResponse.json({
          success: false,
          message:
            "An advertisement session is already active. Please finish it first."
        });
      }

      return NextResponse.json(
        {
          success: false,
          message:
            "Unable to start advertisement. Please try again."
        },
        { status: 500 }
      );
    }

    /* -----------------------------------------------------
       12. SUCCESS
    ----------------------------------------------------- */

    return NextResponse.json({
      success: true,

      sessionId:
        session.id,

      ad: {
        id:
          ad.id,

        title:
          ad.title,

        url:
          ad.ad_url,

        image:
          ad.image_url,

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
