import { verify } from "argon2";

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
