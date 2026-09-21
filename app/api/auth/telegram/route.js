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

  if (
    !crypto.timingSafeEqual(
      Buffer.from(calculatedHash),
      Buffer.from(hash)
    )
  ) {
    return null;
  }

  const authDate = Number(params.get("auth_date"));

  if (!Number.isInteger(authDate)) {
    return null;
  }

  // Reject data older than 24 hours
  const now = Math.floor(Date.now() / 1000);

  if (now - authDate > 86400) {
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

export async function POST(request) {
  try {
    const body = await request.json();
    const { initData, startParam } = body; // startParam এর মাধ্যমে রেফারার আইডি পাওয়া যাবে (যেমন: /start 123456)

    if (!initData) {
      return NextResponse.json(
        {
          success: false,
          message: "Telegram authentication data is required."
        },
        { status: 400 }
      );
    }

    const telegramUser = verifyTelegramInitData(initData);

    if (!telegramUser?.id) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid or expired Telegram authentication data."
        },
        { status: 401 }
      );
    }

    const telegramId = Number(telegramUser.id);
    const clientIp = request.headers.get("x-forwarded-for") || "unknown";
    const userAgent = request.headers.get("user-agent") || "unknown";

    // ডিভাইস হাশ তৈরি (ফেক রেফার প্রটেকশনের জন্য)
    const deviceHash = crypto.createHash("md5").update(userAgent).digest("hex");

    /*
     * Check whether this Telegram account already exists.
     */
    const { data: existingUser, error: findError } =
      await supabaseAdmin
        .from("users")
        .select(
          "id, telegram_id, username, first_name, last_name, balance, total_earned, total_withdraw, is_blocked"
        )
        .eq("telegram_id", telegramId)
        .maybeSingle();

    if (findError) {
      console.error(findError);
      return NextResponse.json(
        {
          success: false,
          message: "Unable to check user account."
        },
        { status: 500 }
      );
    }

    /*
     * Existing account:
     */
    if (existingUser) {
      await supabaseAdmin
        .from("security_logs")
        .insert({
          telegram_id: telegramId,
          event_type: "duplicate_account_attempt",
          severity: "high",
          message: "Existing Telegram account attempted registration.",
          user_agent: userAgent
        });

      if (existingUser.is_blocked) {
        return NextResponse.json(
          {
            success: false,
            blocked: true,
            duplicate: true,
            message: "This account is blocked."
          },
          { status: 403 }
        );
      }

      return NextResponse.json({
        success: true,
        existing: true,
        duplicate: true,
        user: existingUser,
        message: "Account already exists. Existing account loaded."
      });
    }

    /*
     * New Account Registration & Referral Logic
     */
    let referredBy = null;

    if (startParam && !isNaN(startParam)) {
      const referrerId = Number(startParam);

      // ১. সেলফ রেফার চেক (নিজের লিঙ্কে নিজে জয়েন করা রোধ)
      if (referrerId !== telegramId) {
        // ২. ফেক রেফার চেক (একই আইপি বা ডিভাইস দিয়ে একই রেফারারের অধীনে একাধিক অ্যাকাউন্ট খোলা রোধ)
        const { data: fakeCheck } = await supabaseAdmin
          .from("users")
          .select("telegram_id")
          .eq("referred_by", referrerId)
          .or(`ip_address.eq.${clientIp},device_hash.eq.${deviceHash}`)
          .maybeSingle();

        if (fakeCheck) {
          // ফেক সন্দেহ হলে রেফারারকে অটো ব্লক করে দেওয়া
          await supabaseAdmin
            .from("users")
            .update({ is_blocked: true })
            .eq("telegram_id", referrerId);

          await supabaseAdmin.from("security_logs").insert({
            telegram_id: referrerId,
            event_type: "fake_referral_detected",
            severity: "high",
            message: `Fake referral detected from IP: ${clientIp}. Account auto-blocked.`
          });

          return NextResponse.json(
            {
              success: false,
              message: "Suspicious referral activity detected."
            },
            { status: 403 }
          );
        }

        // বৈধ রেফারার চেক
        const { data: validReferrer } = await supabaseAdmin
          .from("users")
          .select("telegram_id, referred_by")
          .eq("telegram_id", referrerId)
          .maybeSingle();

        if (validReferrer) {
          referredBy = referrerId;

          // লেভেল ১, ২, ৩ চেইন হ্যান্ডেল করার জন্য আইডি সেভ রাখা
          // (নোট: সুপাবেস ডাটাবেজে referral_level_1, referral_level_2, referral_level_3 এরে (Array) কলাম রাখতে পারেন)
        }
      }
    }

    /*
     * Create a new account in Supabase.
     */
    const { data: newUser, error: createError } =
      await supabaseAdmin
        .from("users")
        .insert({
          telegram_id: telegramId,
          username: telegramUser.username || null,
          first_name: telegramUser.first_name || null,
          last_name: telegramUser.last_name || null,
          balance: 0,
          total_earned: 0,
          total_withdraw: 0,
          is_blocked: false,
          referred_by: referredBy,
          ip_address: clientIp,
          device_hash: deviceHash
        })
        .select(
          "id, telegram_id, username, first_name, last_name, balance, total_earned, total_withdraw, is_blocked, created_at"
        )
        .single();

    if (createError) {
      if (createError.code === "23505") {
        await supabaseAdmin
          .from("security_logs")
          .insert({
            telegram_id: telegramId,
            event_type: "duplicate_account_attempt",
            severity: "high",
            message: "Duplicate Telegram account creation was blocked by database constraint.",
            user_agent: userAgent
          });

        return NextResponse.json(
          {
            success: false,
            duplicate: true,
            message: "Account already exists."
          },
          { status: 409 }
        );
      }

      console.error(createError);
      return NextResponse.json(
        {
          success: false,
          message: "Unable to create account."
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      existing: false,
      duplicate: false,
      user: newUser,
      message: "Account created successfully."
    });

  } catch (error) {
    console.error("Telegram registration error:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Server error."
      },
      { status: 500 }
    );
  }
}
