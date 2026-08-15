import { readFileSync } from "node:fs";

import { importPKCS8, importSPKI } from "jose";

function normalize_pem(raw: string): string {
  let pem = raw.trim();
  if (pem.includes("\\n") && !pem.includes("\n")) {
    pem = pem.replaceAll("\\n", "\n");
  }
  return pem;
}

function read_pem(
  env: NodeJS.ProcessEnv,
  text_name: string,
  path_name: string,
): string {
  const text = env[text_name]?.trim() ?? "";
  const path = env[path_name]?.trim() ?? "";
  if (text !== "" && path !== "") {
    throw new Error(`${text_name} and ${path_name} cannot both be set`);
  }
  if (text !== "") {
    return normalize_pem(text);
  }
  if (path !== "") {
    try {
      return normalize_pem(readFileSync(path, "utf8"));
    } catch (error) {
      throw new Error(
        `${path_name} is unreadable (${path}): ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
  }
  throw new Error(`${text_name} or ${path_name} is required`);
}

export async function load_private_key(
  env: NodeJS.ProcessEnv = process.env,
): Promise<CryptoKey> {
  const pem = read_pem(env, "UNTANGLED_JWT_PRIVATE_KEY", "UNTANGLED_JWT_PRIVATE_KEY_PATH");
  try {
    return await importPKCS8(pem, "ES256");
  } catch {
    throw new Error("UNTANGLED_JWT_PRIVATE_KEY must be a PKCS8 P-256 private key");
  }
}

export async function load_public_key(
  env: NodeJS.ProcessEnv = process.env,
): Promise<CryptoKey> {
  const pem = read_pem(env, "UNTANGLED_JWT_PUBLIC_KEY", "UNTANGLED_JWT_PUBLIC_KEY_PATH");
  try {
    return await importSPKI(pem, "ES256");
  } catch {
    throw new Error("UNTANGLED_JWT_PUBLIC_KEY must be an SPKI P-256 public key");
  }
}
