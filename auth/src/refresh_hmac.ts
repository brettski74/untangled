import { createHmac, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

export const MIN_REFRESH_HMAC_SECRET_BYTES = 32;
export const REFRESH_TOKEN_BYTES = 32;

export function mint_refresh_token(): string {
  return randomBytes(REFRESH_TOKEN_BYTES).toString("base64url");
}

export function hmac_refresh_token(secret: Buffer, token: string): string {
  return createHmac("sha256", secret).update(token, "utf8").digest("hex");
}

const BASE64_BODY = /^[A-Za-z0-9+/]+={0,2}$/;

function decode_base64_secret(text: string): Buffer {
  const compact = text.replace(/\s+/g, "");
  if (compact === "") {
    throw new Error("UNTANGLED_REFRESH_HMAC_SECRET_PATH is empty");
  }
  if (compact.length % 4 !== 0 || !BASE64_BODY.test(compact)) {
    throw new Error(
      "UNTANGLED_REFRESH_HMAC_SECRET_PATH must be base64-encoded secret bytes",
    );
  }
  const decoded = Buffer.from(compact, "base64");
  const round_trip = decoded.toString("base64");
  if (
    round_trip !== compact &&
    round_trip.replace(/=+$/, "") !== compact.replace(/=+$/, "")
  ) {
    throw new Error(
      "UNTANGLED_REFRESH_HMAC_SECRET_PATH must be base64-encoded secret bytes",
    );
  }
  if (decoded.byteLength < MIN_REFRESH_HMAC_SECRET_BYTES) {
    throw new Error(
      `UNTANGLED_REFRESH_HMAC_SECRET_PATH must decode to at least ${MIN_REFRESH_HMAC_SECRET_BYTES} bytes`,
    );
  }
  return decoded;
}

export function load_refresh_hmac_secret(
  env: NodeJS.ProcessEnv = process.env,
): Buffer {
  const path = env.UNTANGLED_REFRESH_HMAC_SECRET_PATH?.trim() ?? "";
  if (path === "") {
    throw new Error("UNTANGLED_REFRESH_HMAC_SECRET_PATH is required");
  }
  let raw: Buffer;
  try {
    raw = readFileSync(path);
  } catch (error) {
    throw new Error(
      `UNTANGLED_REFRESH_HMAC_SECRET_PATH is unreadable (${path}): ${error instanceof Error ? error.message : "unknown error"}`,
    );
  }
  if (raw.byteLength === 0) {
    throw new Error("UNTANGLED_REFRESH_HMAC_SECRET_PATH is empty");
  }
  return decode_base64_secret(raw.toString("utf8"));
}
