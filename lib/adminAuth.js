import crypto from "crypto";

const COOKIE_NAME = "admin_session";

function getSecret() {
  const secret = process.env.ADMIN_SESSION_SECRET;

  if (!secret) {
    throw new Error("Missing ADMIN_SESSION_SECRET");
  }

  return secret;
}

export function createAdminToken() {
  const payload = {
    role: "admin",
    exp: Date.now() + 24 * 60 * 60 * 1000
  };

  const encoded = Buffer.from(
    JSON.stringify(payload)
  ).toString("base64url");

  const signature = crypto
    .createHmac("sha256", getSecret())
    .update(encoded)
    .digest("base64url");

  return `${encoded}.${signature}`;
}

export function verifyAdminToken(token) {
  try {
    if (!token) return false;

    const [encoded, signature] = token.split(".");

    if (!encoded || !signature) return false;

    const expectedSignature = crypto
      .createHmac("sha256", getSecret())
      .update(encoded)
      .digest("base64url");

    if (
      signature.length !== expectedSignature.length ||
      !crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      )
    ) {
      return false;
    }

    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString()
    );

    if (payload.role !== "admin") return false;

    if (Date.now() > payload.exp) return false;

    return true;
  } catch {
    return false;
  }
}

export { COOKIE_NAME };
