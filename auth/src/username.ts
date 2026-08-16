const USERNAME_RE = /^[a-z0-9_]{3,32}$/;

export function fold_username(raw: string): string {
  return raw.trim().toLowerCase();
}

export function username_is_valid(folded: string): boolean {
  return USERNAME_RE.test(folded);
}
