import { NextResponse } from "next/server";
import {
  verifyAdminToken,
  COOKIE_NAME
} from "../../../../lib/adminAuth";

export async function GET(request) {
  try {
    const token = request.cookies.get(COOKIE_NAME)?.value;

    const valid = verifyAdminToken(token);

    if (!valid) {
      return NextResponse.json(
        {
          success: false,
          authenticated: false,
          message: "Admin authentication required."
        },
        { status: 401 }
      );
    }

    return NextResponse.json({
      success: true,
      authenticated: true,
      role: "admin"
    });

  } catch (error) {
    console.error("Admin session error:", error);

    return NextResponse.json(
      {
        success: false,
        authenticated: false,
        message: "Session verification failed."
      },
      { status: 500 }
    );
  }
}
