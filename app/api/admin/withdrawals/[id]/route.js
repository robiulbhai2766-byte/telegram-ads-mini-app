import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../../lib/supabaseAdmin";
import {
  COOKIE_NAME,
  verifyAdminToken
} from "../../../../../lib/adminAuth";

function isAdmin(request) {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  return verifyAdminToken(token);
}

export async function PATCH(request, { params }) {
  try {
    if (!isAdmin(request)) {
      return NextResponse.json(
        {
          success: false,
          message: "Unauthorized."
        },
        { status: 401 }
      );
    }

    const id = params.id;

    if (!id) {
      return NextResponse.json(
        {
          success: false,
          message: "Withdrawal ID is required."
        },
        { status: 400 }
      );
    }

    const body = await request.json();

    const status = String(body.status || "")
      .trim()
      .toLowerCase();

    const transactionId = body.transaction_id
      ? String(body.transaction_id).trim().slice(0, 200)
      : null;

    const failureReason = body.failure_reason
      ? String(body.failure_reason).trim().slice(0, 500)
      : null;

    if (!["processing", "paid", "failed"].includes(status)) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid withdrawal status."
        },
        { status: 400 }
      );
    }

    /*
      FAILED
      Use secure refund RPC.
    */
    if (status === "failed") {
      if (!failureReason || failureReason.length < 3) {
        return NextResponse.json(
          {
            success: false,
            message: "Failure reason is required."
          },
          { status: 400 }
        );
      }

      const { data, error } = await supabaseAdmin.rpc(
        "fail_withdrawal",
        {
          p_withdrawal_id: id,
          p_failure_reason: failureReason
        }
      );

      if (error) {
        console.error("Failed withdrawal RPC:", error);

        return NextResponse.json(
          {
            success: false,
            message: error.message || "Failed to process refund."
          },
          { status: 400 }
        );
      }

      return NextResponse.json(data);
    }

    /*
      Get current withdrawal status
    */
    const { data: withdrawal, error: getError } =
      await supabaseAdmin
        .from("withdrawals")
        .select("id, status")
        .eq("id", id)
        .single();

    if (getError || !withdrawal) {
      return NextResponse.json(
        {
          success: false,
          message: "Withdrawal not found."
        },
        { status: 404 }
      );
    }

    /*
      Prevent changing terminal states.
    */
    if (
      withdrawal.status === "paid" ||
      withdrawal.status === "failed"
    ) {
      return NextResponse.json(
        {
          success: false,
          message: `Withdrawal is already ${withdrawal.status}.`
        },
        { status: 400 }
      );
    }

    /*
      Valid transitions:
      pending -> processing
      processing -> paid
    */

    if (
      status === "processing" &&
      withdrawal.status !== "pending"
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Only pending withdrawals can be moved to processing."
        },
        { status: 400 }
      );
    }

    if (
      status === "paid" &&
      withdrawal.status !== "processing"
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Only processing withdrawals can be marked paid."
        },
        { status: 400 }
      );
    }

    /*
      Paid requires real provider transaction ID.
    */
    if (status === "paid" && !transactionId) {
      return NextResponse.json(
        {
          success: false,
          message:
            "A real payment transaction ID is required."
        },
        { status: 400 }
      );
    }

    const updateData = {
      status,
      transaction_id:
        status === "paid" ? transactionId : null,
      processed_at:
        status === "processing"
          ? new Date().toISOString()
          : undefined,
      paid_at:
        status === "paid"
          ? new Date().toISOString()
          : undefined
    };

    Object.keys(updateData).forEach((key) => {
      if (updateData[key] === undefined) {
        delete updateData[key];
      }
    });

    const { data, error } = await supabaseAdmin
      .from("withdrawals")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Withdrawal update error:", error);

      return NextResponse.json(
        {
          success: false,
          message: "Could not update withdrawal."
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message:
        status === "paid"
          ? "Withdrawal marked as paid."
          : "Withdrawal moved to processing.",
      withdrawal: data
    });
  } catch (error) {
    console.error("Admin withdrawal API error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Server error."
      },
      { status: 500 }
    );
  }
}
