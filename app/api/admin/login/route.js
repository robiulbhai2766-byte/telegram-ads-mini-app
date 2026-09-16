import { NextResponse } from "next/server";
import crypto from "crypto";

export async function POST(request) {
  try {
    const body = await request.json();

    const email = String(body.email || "").trim();
    const password = String(body.password || "");

    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminEmail || !adminPassword) {
      return NextResponse.json(
        {
          success: false,
          message: "Admin credentials are not configured."
        },
        { status: 500 }
      );
    }

    const emailMatch =
      email.toLowerCase() === adminEmail.toLowerCase();

    const passwordMatch =
      password.length === adminPassword.length &&
      crypto.timingSafeEqual(
        Buffer.from(password),
        Buffer.from(adminPassword)
      );

    if (!emailMatch || !passwordMatch) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid admin credentials."
        },
        { status: 401 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Admin login successful."
    });

  } catch (error) {
    console.error("Admin login error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Server error."
      },
      { status: 500 }
    );
  }
}
