import { describe, expect, it } from "vitest";
import { localDayRangeUtc, shiftDateString, todayInTimeZone } from "@/lib/timezone";

describe("localDayRangeUtc", () => {
  it("computes the UTC range for a Kolkata (+5:30) calendar day", () => {
    const { start, end } = localDayRangeUtc("2026-06-14", "Asia/Kolkata");
    expect(start).toBe("2026-06-13T18:30:00.000Z");
    expect(end).toBe("2026-06-14T18:30:00.000Z");
  });

  it("computes the UTC range for a UTC calendar day", () => {
    const { start, end } = localDayRangeUtc("2026-06-14", "UTC");
    expect(start).toBe("2026-06-14T00:00:00.000Z");
    expect(end).toBe("2026-06-15T00:00:00.000Z");
  });

  it("computes the UTC range for a negative-offset timezone", () => {
    const { start, end } = localDayRangeUtc("2026-06-14", "America/New_York");
    // EDT is UTC-4 in June
    expect(start).toBe("2026-06-14T04:00:00.000Z");
    expect(end).toBe("2026-06-15T04:00:00.000Z");
  });

  it("end is exactly 24h after start", () => {
    const { start, end } = localDayRangeUtc("2026-01-01", "Asia/Kolkata");
    expect(new Date(end).getTime() - new Date(start).getTime()).toBe(24 * 60 * 60 * 1000);
  });
});

describe("todayInTimeZone", () => {
  it("returns YYYY-MM-DD", () => {
    const result = todayInTimeZone("Asia/Kolkata", new Date("2026-06-14T12:00:00Z"));
    expect(result).toBe("2026-06-14");
  });

  it("crosses the date boundary correctly near midnight UTC", () => {
    // 23:00 UTC on June 13 is 04:30 IST on June 14
    const result = todayInTimeZone("Asia/Kolkata", new Date("2026-06-13T23:00:00Z"));
    expect(result).toBe("2026-06-14");
  });
});

describe("shiftDateString", () => {
  it("shifts backwards across a month boundary", () => {
    expect(shiftDateString("2026-06-01", -1)).toBe("2026-05-31");
  });

  it("shifts forwards across a year boundary", () => {
    expect(shiftDateString("2025-12-31", 1)).toBe("2026-01-01");
  });

  it("returns the same date for a zero shift", () => {
    expect(shiftDateString("2026-06-14", 0)).toBe("2026-06-14");
  });
});
