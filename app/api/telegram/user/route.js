import { NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

function verifyTelegramInitData(initData) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  if (!botToken || !initData) {
    return null;
  }

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");

  if (!hash) {
    return null;
  }

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

  if (hash.length !== calculatedHash.length) {
    return null;
  }

  if (
    !crypto.timingSafeEqual(
      Buffer.from(hash),
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

  // Telegram authentication data older than 24 hours is rejected.
  if (now - authDate > 86400) {
    return null;
  }

  // Reject obviously future-dated authentication data.
  if (authDate > now + 60) {
    return null;
  }

  const userString = params.get("user");

  if (!userString) {
    return null;
  }

  try {
    return JSON.parse(userString);
  } catch {
    return null;
  }
}

export async function GET(request) {
  try {
    const initData =
      request.headers.get("x-telegram-init-data");

    if (!initData) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Telegram authentication data is required."
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
            "Invalid or expired Telegram authentication data."
        },
        { status: 401 }
      );
    }

    const telegramId = Number(telegramUser.id);

    if (
      !Number.isSafeInteger(telegramId) ||
      telegramId <= 0
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid Telegram user ID."
        },
        { status: 400 }
      );
    }

    /*
     * Check existing account.
     */
    const { data: existingUser, error: findError } =
      await supabaseAdmin
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
        .eq("telegram_id", telegramId)
        .maybeSingle();

    if (findError) {
      console.error(
        "User lookup error:",
        findError
      );

      return NextResponse.json(
        {
          success: false,
          message: "Unable to load user account."
        },
        { status: 500 }
      );
    }

    /*
     * Existing user:
     * Never create a second account.
     */
    if (existingUser) {
      if (existingUser.is_blocked) {
        return NextResponse.json(
          {
            success: false,
            blocked: true,
            existing: true,
            message:
              "Your account is blocked."
          },
          { status: 403 }
        );
      }

      /*
       * Update basic Telegram profile information.
       * Balance and earnings are NOT changed here.
       */
      const { data: updatedUser, error: updateError } =
        await supabaseAdmin
          .from("users")
          .update({
            username:
              telegramUser.username || null,
            first_name:
              telegramUser.first_name || null,
            last_name:
              telegramUser.last_name || null
          })
          .eq("id", existingUser.id)
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
          .single();

      if (updateError) {
        console.error(
          "User profile update error:",
          updateError
        );

        return NextResponse.json({
          success: true,
          existing: true,
          user: existingUser
        });
      }

      return NextResponse.json({
        success: true,
        existing: true,
        user: updatedUser
      });
    }

    /*
     * Create first account.
     */
    const { data: newUser, error: createError } =
      await supabaseAdmin
        .from("users")
        .insert({
          telegram_id: telegramId,
          username:
            telegramUser.username || null,
          first_name:
            telegramUser.first_name || null,
          last_name:
            telegramUser.last_name || null,
          balance: 0,
          total_earned: 0,
          total_withdraw: 0,
          is_blocked: false
        })
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
        .single();

    if (createError) {
      /*
       * Unique constraint:
       * users_telegram_id_unique
       */
      if (createError.code === "23505") {
        await supabaseAdmin
          .from("security_logs")
          .insert({
            telegram_id: telegramId,
            event_type:
              "duplicate_account_attempt",
            severity: "high",
            message:
              "Duplicate Telegram account creation was blocked by database unique constraint.",
            user_agent:
              request.headers.get("user-agent") || null
          });

        return NextResponse.json(
          {
            success: false,
            duplicate: true,
            message:
              "An account already exists for this Telegram ID."
          },
          { status: 409 }
        );
      }

      console.error(
        "User creation error:",
        createError
      );

      return NextResponse.json(
        {
          success: false,
          message:
            "Unable to create user account."
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      existing: false,
      user: newUser,
      message:
        "Account created successfully."
    });

  } catch (error) {
    console.error(
      "Telegram user API error:",
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
