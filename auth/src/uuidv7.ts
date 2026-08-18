import { randomBytes } from "node:crypto";

/** RFC 9562 UUIDv7 as a hyphenated string. */
export function new_uuid7(now_ms: number = Date.now()): string {
  const unix_ms = now_ms % 0x1_0000_0000_0000;
  const rand = randomBytes(10);
  const rand_a = ((rand[0]! << 8) | rand[1]!) & 0x0fff;
  const bytes = Buffer.alloc(16);
  bytes.writeUIntBE(unix_ms, 0, 6);
  bytes[6] = 0x70 | ((rand_a >> 8) & 0x0f);
  bytes[7] = rand_a & 0xff;
  bytes[8] = 0x80 | (rand[2]! & 0x3f);
  rand.copy(bytes, 9, 3, 10);
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
