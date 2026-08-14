import { randomBytes, timingSafeEqual } from "node:crypto";

export function random_token(): string {
  return randomBytes(32).toString("base64url");
}

export function tokens_equal(left: string, right: string): boolean {
  const left_buf = Buffer.from(left);
  const right_buf = Buffer.from(right);
  if (left_buf.length !== right_buf.length) {
    timingSafeEqual(left_buf, left_buf);
    return false;
  }
  return timingSafeEqual(left_buf, right_buf);
}
