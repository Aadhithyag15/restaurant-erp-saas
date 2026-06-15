import { describe, expect, it } from "vitest";
import { parseDailyClosingForm } from "@/lib/accounting";

function fields(overrides: Partial<{ openingCash: string; closingCash: string; cashRefunds: string; notes: string }> = {}) {
  return {
    openingCash: "1000",
    closingCash: "5000",
    cashRefunds: "200",
    notes: "",
    ...overrides,
  };
}

describe("parseDailyClosingForm", () => {
  it("accepts valid cash amounts", () => {
    const result = parseDailyClosingForm(fields());
    expect(result).toEqual({
      ok: true,
      input: { openingCash: 1000, closingCash: 5000, cashRefunds: 200, notes: null },
    });
  });

  it("rounds amounts to 2dp", () => {
    const result = parseDailyClosingForm(fields({ openingCash: "1000.005" }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.input.openingCash).toBeCloseTo(1000.01, 2);
  });

  it("rejects negative amounts", () => {
    expect(parseDailyClosingForm(fields({ openingCash: "-1" }))).toEqual({ ok: false, error: "Opening cash must be a number 0 or greater." });
  });

  it("rejects non-numeric amounts", () => {
    expect(parseDailyClosingForm(fields({ closingCash: "abc" }))).toEqual({ ok: false, error: "Closing cash must be a number 0 or greater." });
  });

  it("rejects amounts above the maximum", () => {
    expect(parseDailyClosingForm(fields({ cashRefunds: "99999999" }))).toEqual({ ok: false, error: "Cash refunds is too large." });
  });

  it("trims notes and treats empty as null", () => {
    const result = parseDailyClosingForm(fields({ notes: "  Till short by 20  " }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.input.notes).toBe("Till short by 20");
  });

  it("rejects notes over 500 characters", () => {
    const result = parseDailyClosingForm(fields({ notes: "x".repeat(501) }));
    expect(result).toEqual({ ok: false, error: "Notes must be 500 characters or fewer." });
  });
});
