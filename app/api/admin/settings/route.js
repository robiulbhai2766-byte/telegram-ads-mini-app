import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";
import { COOKIE_NAME, verifyAdminToken } from "../../../../lib/adminAuth";

function isAdmin(request) {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  return verifyAdminToken(token);
}

export async function GET(request) {
  try {
    if (!isAdmin(request)) {
      return NextResponse.json(
        {
          success: false,
          message: "Unauthorized."
        },
        { status: 401 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("admin_settings")
      .select(`
        id,
        ad_cooldown_seconds,
        max_daily_ads,
        daily_reset_hours,
        user_ad_cooldown_minutes
      `)
      .eq("id", 1)
      .single();

    if (error) {
      console.error("GET_ADMIN_SETTINGS_ERROR:", error);

      return NextResponse.json(
        {
          success: false,
          message: error.message
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        settings: data
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  } catch (error) {
    console.error("GET_ADMIN_SETTINGS_EXCEPTION:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Unable to load settings."
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request) {
  try {
    if (!isAdmin(request)) {
      return NextResponse.json(
        {
          success: false,
          message: "Unauthorized."
        },
        { status: 401 }
      );
    }

    const body = await request.json();

    const adCooldownSeconds = Number(
      body.ad_cooldown_seconds
    );

    const maxDailyAds = Number(
      body.max_daily_ads
    );

    const dailyResetHours = Number(
      body.daily_reset_hours
    );

    if (
      !Number.isInteger(adCooldownSeconds) ||
      adCooldownSeconds < 0 ||
      adCooldownSeconds > 86400
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Ad cooldown must be between 0 and 86400 seconds."
        },
        { status: 400 }
      );
    }

    if (
      !Number.isInteger(maxDailyAds) ||
      maxDailyAds < 1 ||
      maxDailyAds > 10000
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Daily ad limit must be between 1 and 10000."
        },
        { status: 400 }
      );
    }

    if (
      !Number.isInteger(dailyResetHours) ||
      dailyResetHours < 1 ||
      dailyResetHours > 168
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Daily reset hours must be between 1 and 168."
        },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("admin_settings")
      .update({
        ad_cooldown_seconds: adCooldownSeconds,
        max_daily_ads: maxDailyAds,
        daily_reset_hours: dailyResetHours
      })
      .eq("id", 1)
      .select(`
        id,
        ad_cooldown_seconds,
        max_daily_ads,
        daily_reset_hours,
        user_ad_cooldown_minutes
      `)
      .single();

    if (error) {
      console.error("PATCH_ADMIN_SETTINGS_ERROR:", error);

      return NextResponse.json(
        {
          success: false,
          message: error.message
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: "Ad settings saved successfully.",
        settings: data
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  } catch (error) {
    console.error("PATCH_ADMIN_SETTINGS_EXCEPTION:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Unable to save settings."
      },
      { status: 500 }
    );
  }
}
