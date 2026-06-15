/**
 * Tenant-local date helpers. Tenants store an IANA `timezone` (default
 * Asia/Kolkata, no DST) and "today"/date filters on orders should reflect
 * that, not the server's UTC clock.
 */

/** Offset (ms) to add to a UTC instant to get its wall-clock time in `timeZone`. */
function tzOffsetMs(utcInstant: Date, timeZone: string): number {
  const tzWallClock = new Date(utcInstant.toLocaleString("en-US", { timeZone }));
  const utcWallClock = new Date(utcInstant.toLocaleString("en-US", { timeZone: "UTC" }));
  return tzWallClock.getTime() - utcWallClock.getTime();
}

/** Today's date (YYYY-MM-DD) as seen in `timeZone`. */
export function todayInTimeZone(timeZone: string, now: Date = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone });
}

/**
 * UTC instant range `[start, end)` covering the local calendar day `dateStr`
 * (YYYY-MM-DD) in `timeZone`. Returns ISO strings for `created_at` comparisons.
 */
export function localDayRangeUtc(dateStr: string, timeZone: string): { start: string; end: string } {
  const [year, month, day] = dateStr.split("-").map(Number);
  const naiveUtcMidnight = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  const offset = tzOffsetMs(naiveUtcMidnight, timeZone);
  const start = new Date(naiveUtcMidnight.getTime() - offset);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
}

/** Returns the date (YYYY-MM-DD) `days` away from `dateStr`. Used to build day-by-day series. */
export function shiftDateString(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
