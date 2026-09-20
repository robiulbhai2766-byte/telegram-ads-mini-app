import { NextResponse } from "next/server";
import crypto from "crypto";
import {
  COOKIE_NAME,
  verifyAdminToken
} from "../../../../../lib/adminAuth";

export async function GET(request) {
  try {
    const token = request.cookies.get(COOKIE_NAME)?.value;

    if (!verifyAdminToken(token)) {
      return NextResponse.json(
        {
          success: false,
          message: "Unauthorized."
        },
        { status: 401 }
      );
    }

    const apiKey = process.env.BINANCE_API_KEY;
    const apiSecret = process.env.BINANCE_API_SECRET;

    if (!apiKey || !apiSecret) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Binance API credentials are not configured."
        },
        { status: 500 }
      );
    }

    const timestamp = Date.now();
    const recvWindow = 5000;

    const queryString =
      `timestamp=${timestamp}&recvWindow=${recvWindow}`;

    const signature = crypto
      .createHmac("sha256", apiSecret)
      .update(queryString)
      .digest("hex");

    const response = await fetch(
      `https://api.binance.com/sapi/v1/account/apiRestrictions?${queryString}&signature=${signature}`,
      {
        method: "GET",
        headers: {
          "X-MBX-APIKEY": apiKey
        },
        cache: "no-store"
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Binance API error:", data);

      return NextResponse.json(
        {
          success: false,
          message: "Binance API connection failed."
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Binance API connection successful.",
      permissions: {
        ipRestricted: data.ipRestrict === true,
        withdrawalsEnabled:
          data.enableWithdrawals === true,
        readingEnabled:
          data.enableReading === true
      }
    });
  } catch (error) {
    console.error("Binance test error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Binance connection test failed."
      },
      { status: 500 }
    );
  }
}
