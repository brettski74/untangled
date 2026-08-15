import { hash, verify, argon2id } from "argon2";

/** Match Python ``argon2.PasswordHasher()`` defaults so dummy verify cost lines up. */
export const ARGON2ID_PARAMS = {
  type: argon2id,
  timeCost: 3,
  memoryCost: 65536,
  parallelism: 4,
  hashLength: 32,
} as const;

/** Argon2id verify off the event loop (native libuv threadpool). */
export async function verify_password(
  password_hash: string,
  password: string,
): Promise<boolean> {
  try {
    return await verify(password_hash, password);
  } catch {
    return false;
  }
}

export async function make_dummy_hash(): Promise<string> {
  return hash("untangled-dummy-not-a-user-password", ARGON2ID_PARAMS);
}
