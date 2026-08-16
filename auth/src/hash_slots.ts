export type HashSlotLimiter = {
  try_acquire: () => boolean;
  release: () => void;
  in_use: () => number;
};

/** In-process try-acquire; never queues. Limit may change via ``get_limit``. */
export function make_hash_slot_limiter(get_limit: () => number): HashSlotLimiter {
  let used = 0;
  return {
    try_acquire(): boolean {
      if (used >= get_limit()) {
        return false;
      }
      used += 1;
      return true;
    },
    release(): void {
      if (used > 0) {
        used -= 1;
      }
    },
    in_use(): number {
      return used;
    },
  };
}
