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

// UPDATE AD
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

    const updates = {};

    if (body.title !== undefined) {
      const title = String(body.title).trim();

      if (!title) {
        return NextResponse.json(
          {
            success: false,
            message: "Title cannot be empty."
          },
          { status: 400 }
        );
      }

      updates.title = title;
    }

    if (body.ad_url !== undefined) {
      const adUrl = String(body.ad_url).trim();

      if (!adUrl) {
        return NextResponse.json(
          {
            success: false,
            message: "Ad URL cannot be empty."
          },
          { status: 400 }
        );
      }

      updates.ad_url = adUrl;
    }

    if (body.image_url !== undefined) {
      updates.image_url = body.image_url
        ? String(body.image_url).trim()
        : null;
    }

    if (body.reward !== undefined) {
      const reward = Number(body.reward);

      if (!Number.isFinite(reward) || reward <= 0) {
        return NextResponse.json(
          {
            success: false,
            message: "Invalid reward."
          },
          { status: 400 }
        );
      }

      updates.reward = reward;
    }

    if (body.daily_limit !== undefined) {
      const dailyLimit = Number(body.daily_limit);

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

      updates.daily_limit = dailyLimit;
    }

    if (body.is_active !== undefined) {
      updates.is_active = Boolean(body.is_active);
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        {
          success: false,
          message: "No changes provided."
        },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("ads")
      .update(updates)
      .eq("id", id)
      .select()
      .maybeSingle();

    if (error) {
      console.error(error);

      return NextResponse.json(
        {
          success: false,
          message: "Unable to update advertisement."
        },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        {
          success: false,
          message: "Advertisement not found."
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Advertisement updated successfully.",
      ad: data
    });

  } catch (error) {
    console.error("Admin ad PATCH error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Server error."
      },
      { status: 500 }
    );
  }
}


// DELETE AD
export async function DELETE(request, { params }) {
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

    const { error } = await supabaseAdmin
      .from("ads")
      .delete()
      .eq("id", id);

    if (error) {
      console.error(error);

      return NextResponse.json(
        {
          success: false,
          message: "Unable to delete advertisement."
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Advertisement deleted successfully."
    });

  } catch (error) {
    console.error("Admin ad DELETE error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Server error."
      },
      { status: 500 }
    );
  }
}
