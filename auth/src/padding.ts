import { randomInt } from "node:crypto";

export function draw_process_time_ms(min: number, max: number): number {
  if (max < min) {
    throw new Error("login_process_time_minimum must be <= login_process_time_maximum");
  }
  return randomInt(min, max + 1);
}

export function remaining_wait_ms(
  t_ms: number,
  rl_delays_ms: number,
  elapsed_ms: number,
): number {
  return Math.max(0, t_ms + rl_delays_ms - elapsed_ms);
}

export function sleep_ms(ms: number): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
