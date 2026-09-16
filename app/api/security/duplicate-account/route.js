import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export async function POST(request) {
  try {
    const body = await request.json();

    const telegramId = Number(body.telegram_id);

    if (!Number.isSafeInteger(telegramId) || telegramId <= 0) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid Telegram ID."
        },
        { status: 400 }
      );
    }

    const { data: existingUser, error: userError } =
      await supabaseAdmin
        .from("users")
        .select("id, telegram_id, is_blocked")
        .eq("telegram_id", telegramId)
        .maybeSingle();

    if (userError) {
      console.error(userError);

      return NextResponse.json(
        {
          success: false,
          message: "Unable to check account."
        },
        { status: 500 }
      );
    }

    if (!existingUser) {
      return NextResponse.json({
        success: true,
        duplicate: false,
        message: "No existing account found."
      });
    }

    const userAgent =
      request.headers.get("user-agent") || null;

    /*
     * Log the duplicate-account attempt.
     * Do not store raw IP addresses.
     */
    const { error: logError } =
      await supabaseAdmin
        .from("security_logs")
        .insert({
          telegram_id: telegramId,
          event_type: "duplicate_account_attempt",
          severity: "high",
          message:
            "An existing Telegram account was detected during account creation.",
          user_agent: userAgent
        });

    if (logError) {
      console.error("Security log error:", logError);
    }

    return NextResponse.json({
      success: true,
      duplicate: true,
      blocked: Boolean(existingUser.is_blocked),
      message:
        "An account already exists for this Telegram ID."
    });

  } catch (error) {
    console.error(
      "Duplicate account API error:",
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
