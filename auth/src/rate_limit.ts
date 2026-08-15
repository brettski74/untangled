export type RateLimitResult = {
  delay_ms: number;
  lockout: boolean;
};

export type RateLimitEvaluator = {
  evaluate: (
    username_key: string,
    source_ip: string | undefined,
  ) => RateLimitResult | Promise<RateLimitResult>;
  record_failure: (
    username_key: string,
    source_ip: string | undefined,
  ) => void | Promise<void>;
};

/** #214 seam: delay 0, never L3, no Redis writes. */
export function stub_rate_limit(): RateLimitEvaluator {
  return {
    evaluate() {
      return { delay_ms: 0, lockout: false };
    },
    record_failure() {},
  };
}
