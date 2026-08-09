/** Stable coherence topic names and minimal payloads (no secrets/PII). */

export const SYSTEM_CONFIG_INVALIDATE_TOPIC =
  "untangled.coherence.system_config.invalidate";

export const SYSTEM_CONFIG_INVALIDATE_PAYLOAD: Record<string, unknown> = { v: 1 };
