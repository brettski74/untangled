/** Documented local seed users from ``docs/local-development.md`` / ``untangled.seed.users``. */
export const SEED_USERS = {
  admin: {
    username: "admin",
    password: "admin-change-me",
    display_name: "Local Admin",
  },
  incident: {
    username: "incident",
    password: "incident-change-me",
    display_name: "Local Incident Reader",
  },
  readwrite: {
    username: "readwrite",
    password: "readwrite-change-me",
    display_name: "Local Read-Write",
  },
  readonly: {
    username: "readonly",
    password: "readonly-change-me",
    display_name: "Local Read-Only",
  },
  change: {
    username: "change",
    password: "change-change-me",
    display_name: "Local Change Operator",
  },
} as const;

export type SeedUserKey = keyof typeof SEED_USERS;
