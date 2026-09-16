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

    const requestedStatus = String(
      body.status || ""
    ).toLowerCase();

    if (
      requestedStatus !== "approved" &&
      requestedStatus !== "rejected"
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Status must be approved or rejected."
        },
        { status: 400 }
      );
    }

    const { data: withdrawal, error: findError } =
      await supabaseAdmin
        .from("withdrawals")
        .select("*")
        .eq("id", id)
        .maybeSingle();

    if (findError) {
      console.error(findError);

      return NextResponse.json(
        {
          success: false,
          message: "Unable to find withdrawal."
        },
        { status: 500 }
      );
    }

    if (!withdrawal) {
      return NextResponse.json(
        {
          success: false,
          message: "Withdrawal not found."
        },
        { status: 404 }
      );
    }

    if (withdrawal.status !== "pending") {
      return NextResponse.json(
        {
          success: false,
          message:
            "This withdrawal has already been processed."
        },
        { status: 409 }
      );
    }

    /*
     * IMPORTANT:
     * This step only changes the withdrawal status.
     * It does NOT send money automatically.
     */

    const { data, error } = await supabaseAdmin
      .from("withdrawals")
      .update({
        status: requestedStatus
      })
      .eq("id", id)
      .eq("status", "pending")
      .select("*")
      .maybeSingle();

    if (error) {
      console.error(error);

      return NextResponse.json(
        {
          success: false,
          message:
            "Unable to update withdrawal."
        },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Withdrawal was already processed."
        },
        { status: 409 }
      );
    }

    return NextResponse.json({
      success: true,
      message:
        requestedStatus === "approved"
          ? "Withdrawal approved successfully."
          : "Withdrawal rejected successfully.",
      withdrawal: data
    });

  } catch (error) {
    console.error(
      "Admin withdrawal PATCH error:",
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
