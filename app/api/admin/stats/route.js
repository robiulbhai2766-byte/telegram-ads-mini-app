import { NextResponse } from "next/server";
import {
  verifyAdminToken,
  COOKIE_NAME
} from "../../../../lib/adminAuth";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export async function GET(request) {
  try {
    // Admin authentication
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

    // Total users
    const { count: totalUsers, error: usersError } =
      await supabaseAdmin
        .from("users")
        .select("*", {
          count: "exact",
          head: true
        });

    if (usersError) {
      console.error(usersError);
      throw new Error("Unable to count users.");
    }

    // Blocked users
    const { count: blockedUsers, error: blockedError } =
      await supabaseAdmin
        .from("users")
        .select("*", {
          count: "exact",
          head: true
        })
        .eq("is_blocked", true);

    if (blockedError) {
      console.error(blockedError);
      throw new Error("Unable to count blocked users.");
    }

    // Active ads
    const { count: activeAds, error: adsError } =
      await supabaseAdmin
        .from("ads")
        .select("*", {
          count: "exact",
          head: true
        })
        .eq("is_active", true);

    if (adsError) {
      console.error(adsError);
      throw new Error("Unable to count active ads.");
    }

    // Total ad views
    const { count: totalAdViews, error: viewsError } =
      await supabaseAdmin
        .from("ad_views")
        .select("*", {
          count: "exact",
          head: true
        });

    if (viewsError) {
      console.error(viewsError);
      throw new Error("Unable to count ad views.");
    }

    // Total earnings
    const { data: earningsData, error: earningsError } =
      await supabaseAdmin
        .from("earnings")
        .select("amount");

    if (earningsError) {
      console.error(earningsError);
      throw new Error("Unable to calculate earnings.");
    }

    const totalEarnings = (earningsData || []).reduce(
      (sum, row) => sum + Number(row.amount || 0),
      0
    );

    // Total withdrawals
    const { data: withdrawalsData, error: withdrawalsError } =
      await supabaseAdmin
        .from("withdrawals")
        .select("amount");

    if (withdrawalsError) {
      console.error(withdrawalsError);
      throw new Error("Unable to calculate withdrawals.");
    }

    const totalWithdrawals = (withdrawalsData || []).reduce(
      (sum, row) => sum + Number(row.amount || 0),
      0
    );

    return NextResponse.json({
      success: true,
      stats: {
        totalUsers: totalUsers || 0,
        blockedUsers: blockedUsers || 0,
        activeAds: activeAds || 0,
        totalAdViews: totalAdViews || 0,
        totalEarnings: Number(totalEarnings.toFixed(3)),
        totalWithdrawals: Number(totalWithdrawals.toFixed(3))
      }
    });

  } catch (error) {
    console.error("Admin stats error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Unable to load dashboard statistics."
      },
      { status: 500 }
    );
  }
}
