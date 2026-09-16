import { NextResponse } from "next/server";
import {
  verifyAdminToken,
  COOKIE_NAME
} from "../../../../lib/adminAuth";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export async function GET(request) {
  try {
    const token = request.cookies.get(COOKIE_NAME)?.value;

    if (!verifyAdminToken(token)) {
      return NextResponse.json(
        {
          success: false,
          message: "Admin authentication required."
        },
        { status: 401 }
      );
    }

    const { data: users, error } = await supabaseAdmin
      .from("users")
      .select(
        `
        id,
        telegram_id,
        username,
        first_name,
        last_name,
        balance,
        total_earned,
        total_withdraw,
        referral_code,
        referred_by,
        is_blocked,
        created_at
        `
      )
      .order("created_at", {
        ascending: false
      });

    if (error) {
      console.error(error);

      return NextResponse.json(
        {
          success: false,
          message: "Unable to load users."
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      users: users || []
    });

  } catch (error) {
    console.error("Admin users GET error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Server error."
      },
      { status: 500 }
    );
  }
}
