import { NextResponse } from "next/server";
import {
  verifyAdminToken,
  COOKIE_NAME
} from "../../../../lib/adminAuth";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

async function checkAdmin(request) {
  const token = request.cookies.get(COOKIE_NAME)?.value;

  return verifyAdminToken(token);
}

// GET — সব Ads
export async function GET(request) {
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

    const { data, error } = await supabaseAdmin
      .from("ads")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);

      return NextResponse.json(
        {
          success: false,
          message: "Unable to load ads."
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      ads: data
    });

  } catch (error) {
    console.error("Admin ads GET error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Server error."
      },
      { status: 500 }
    );
  }
}


// POST — নতুন Ad
export async function POST(request) {
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

    const body = await request.json();

    const title = String(body.title || "").trim();
    const adUrl = String(body.ad_url || "").trim();
    const imageUrl = body.image_url
      ? String(body.image_url).trim()
      : null;

    const reward = Number(body.reward);
    const dailyLimit = Number(body.daily_limit || 20);
    const isActive = body.is_active !== false;

    if (!title || !adUrl) {
      return NextResponse.json(
        {
          success: false,
          message: "Title and ad URL are required."
        },
        { status: 400 }
      );
    }

    if (!Number.isFinite(reward) || reward <= 0) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid reward amount."
        },
        { status: 400 }
      );
    }

    if (
      !Number.isInteger(dailyLimit) ||
      dailyLimit < 1 ||
      dailyLimit > 10000
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid daily limit."
        },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("ads")
      .insert({
        title,
        ad_url: adUrl,
        image_url: imageUrl,
        reward,
        daily_limit: dailyLimit,
        is_active: isActive
      })
      .select()
      .single();

    if (error) {
      console.error(error);

      return NextResponse.json(
        {
          success: false,
          message: "Unable to create ad."
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Advertisement created successfully.",
      ad: data
    });

  } catch (error) {
    console.error("Admin ads POST error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Server error."
      },
      { status: 500 }
    );
  }
}
