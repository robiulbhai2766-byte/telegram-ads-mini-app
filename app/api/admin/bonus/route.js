import { NextResponse } from "next/server";
import {
  verifyAdminToken,
  COOKIE_NAME
} from "../../../../../lib/adminAuth";
import { supabaseAdmin } from "../../../../../lib/supabaseAdmin";

function isAdmin(request) {
  const token =
    request.cookies.get(COOKIE_NAME)?.value;

  return verifyAdminToken(token);
}

export async function GET(request) {
  try {
    if (!isAdmin(request)) {
      return NextResponse.json(
        {
          success: false,
          message: "Admin authentication required."
        },
        { status: 401 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("admin_settings")
      .select(
        "daily_bonus_amount, daily_bonus_enabled"
      )
      .eq("id", 1)
      .single();

    if (error) {
      console.error(
        "LOAD_BONUS_SETTINGS_ERROR",
        error
      );

      return NextResponse.json(
        {
          success: false,
          message:
            "Unable to load bonus settings."
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      settings: data
    });

  } catch (error) {
    console.error(
      "BONUS_GET_ERROR",
      error
    );

    return NextResponse.json(
      {
        success: false,
        message: "Server error."
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
          message: "Admin authentication required."
        },
        { status: 401 }
      );
    }

    const body = await request.json();

    const amount = Number(
      body?.daily_bonus_amount
    );

    const enabled =
      body?.daily_bonus_enabled;

    if (
      !Number.isFinite(amount) ||
      amount <= 0 ||
      amount > 100
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Bonus amount must be between 0.001 and 100."
        },
        { status: 400 }
      );
    }

    if (typeof enabled !== "boolean") {
      return NextResponse.json(
        {
          success: false,
          message:
            "Daily bonus enabled status is invalid."
        },
        { status: 400 }
      );
    }

    const { data, error } =
      await supabaseAdmin
        .from("admin_settings")
        .update({
          daily_bonus_amount: amount,
          daily_bonus_enabled: enabled
        })
        .eq("id", 1)
        .select(
          "daily_bonus_amount, daily_bonus_enabled"
        )
        .single();

    if (error) {
      console.error(
        "SAVE_BONUS_SETTINGS_ERROR",
        error
      );

      return NextResponse.json(
        {
          success: false,
          message:
            "Unable to save bonus settings."
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message:
        "Daily Bonus settings saved successfully.",
      settings: data
    });

  } catch (error) {
    console.error(
      "BONUS_PATCH_ERROR",
      error
    );

    return NextResponse.json(
      {
        success: false,
        message: "Server error."
      },
      { status: 500 }
    );
  }
}
