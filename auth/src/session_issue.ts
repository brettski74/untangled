export type LoginSessionTimes = {
  session_expires_at: Date;
  refresh_expires_at: Date;
  jwt_ttl_seconds: number;
  access_max_age: number;
  refresh_max_age: number | null;
};

export function login_session_times(args: {
  now: Date;
  access_ttl_seconds: number;
  refresh_ttl_seconds: number;
  total_ttl_seconds: number;
  must_change: boolean;
}): LoginSessionTimes {
  const issued = Math.floor(args.now.getTime() / 1000);
  const session_exp = issued + args.total_ttl_seconds;
  const jwt_exp = issued + args.access_ttl_seconds;
  const session_expires_at = new Date(session_exp * 1000);
  if (args.must_change) {
    return {
      session_expires_at,
      refresh_expires_at: new Date(jwt_exp * 1000),
      jwt_ttl_seconds: args.access_ttl_seconds,
      access_max_age: Math.max(1, args.access_ttl_seconds),
      refresh_max_age: null,
    };
  }
  const refresh_exp = Math.min(issued + args.refresh_ttl_seconds, session_exp);
  const remaining = Math.max(1, refresh_exp - issued);
  return {
    session_expires_at,
    refresh_expires_at: new Date(refresh_exp * 1000),
    jwt_ttl_seconds: args.access_ttl_seconds,
    access_max_age: remaining,
    refresh_max_age: remaining,
  };
}

export function rotate_session_times(args: {
  now: Date;
  session_expires_at: Date;
  refresh_ttl_seconds: number;
}): { refresh_expires_at: Date; max_age: number } {
  const issued = Math.floor(args.now.getTime() / 1000);
  const session_exp = Math.floor(args.session_expires_at.getTime() / 1000);
  const refresh_exp = Math.min(issued + args.refresh_ttl_seconds, session_exp);
  return {
    refresh_expires_at: new Date(refresh_exp * 1000),
    max_age: Math.max(1, refresh_exp - issued),
  };
}
