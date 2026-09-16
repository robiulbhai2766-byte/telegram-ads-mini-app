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

    const { data, error } = await supabaseAdmin
      .from("withdrawals")
      .select("*")
      .order("created_at", {
        ascending: false
      });

    if (error) {
      console.error(error);

      return NextResponse.json(
        {
          success: false,
          message: "Unable to load withdrawals."
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      withdrawals: data || []
    });

  } catch (error) {
    console.error(
      "Admin withdrawals GET error:",
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
