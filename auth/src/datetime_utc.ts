/** Round a Date to the nearest whole second (half-up at 500ms). */
export function utc_seconds(value: Date): Date {
  return new Date(Math.round(value.getTime() / 1000) * 1000);
}

export function utc_now(): Date {
  return utc_seconds(new Date());
}
