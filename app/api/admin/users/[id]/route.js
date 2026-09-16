import { NextResponse } from "next/server";
import {
  verifyAdminToken,
  COOKIE_NAME
} from "../../../../../lib/adminAuth";
import { supabaseAdmin } from "../../../../../lib/supabaseAdmin";

function checkAdmin(request) {
  const token = request.cookies.get(COOKIE_NAME)?.value;

  return verifyAdminToken(token);
}

export async function PATCH(request, { params }) {
  try {
    if (!checkAdmin(request)) {
      return NextResponse.json(
        {
          success: false,
          message: "Admin authentication required."
        },
        { status: 401 }
      );
    }

    const { id } = await params;
    const body = await request.json();

    if (typeof body.is_blocked !== "boolean") {
      return NextResponse.json(
        {
          success: false,
          message: "is_blocked must be true or false."
        },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("users")
      .update({
        is_blocked: body.is_blocked
      })
      .eq("id", id)
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
        is_blocked,
        created_at
        `
      )
      .maybeSingle();

    if (error) {
      console.error(error);

      return NextResponse.json(
        {
          success: false,
          message: "Unable to update user."
        },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        {
          success: false,
          message: "User not found."
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: data.is_blocked
        ? "User blocked successfully."
        : "User unblocked successfully.",
      user: data
    });

  } catch (error) {
    console.error("Admin user PATCH error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Server error."
      },
      { status: 500 }
    );
  }
}
