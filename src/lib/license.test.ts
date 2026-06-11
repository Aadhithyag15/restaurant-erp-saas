import { describe, expect, it } from "vitest";
import { deriveLicense } from "@/lib/license";

const NOW = new Date("2026-06-11T12:00:00Z");
const days = (n: number) => new Date(NOW.getTime() + n * 86_400_000).toISOString();

describe("deriveLicense", () => {
  it("treats a missing subscription as inactive", () => {
    expect(deriveLicense(null, NOW)).toEqual({ isActive: false, state: "none", daysLeft: null });
  });

  it("is active during a live trial with correct days left", () => {
    const lic = deriveLicense({ status: "trialing", trial_ends_at: days(14), current_period_end: null }, NOW);
    expect(lic.isActive).toBe(true);
    expect(lic.state).toBe("trialing");
    expect(lic.daysLeft).toBe(14);
  });

  it("rounds partial days up (3.2 days left shows 4)", () => {
    const ends = new Date(NOW.getTime() + 3.2 * 86_400_000).toISOString();
    expect(deriveLicense({ status: "trialing", trial_ends_at: ends, current_period_end: null }, NOW).daysLeft).toBe(4);
  });

  it("expires a trial at the exact timestamp, even if the cron has not flipped the status", () => {
    const lic = deriveLicense({ status: "trialing", trial_ends_at: days(-0.001), current_period_end: null }, NOW);
    expect(lic).toEqual({ isActive: false, state: "expired", daysLeft: 0 });
  });

  it("treats active with no period end as active (manually activated)", () => {
    expect(deriveLicense({ status: "active", trial_ends_at: null, current_period_end: null }, NOW).isActive).toBe(true);
  });

  it("expires active subscriptions past current_period_end", () => {
    const lic = deriveLicense({ status: "active", trial_ends_at: null, current_period_end: days(-1) }, NOW);
    expect(lic).toEqual({ isActive: false, state: "expired", daysLeft: 0 });
  });

  it.each(["past_due", "canceled", "expired"])("treats %s as inactive", (status) => {
    expect(deriveLicense({ status, trial_ends_at: null, current_period_end: null }, NOW).isActive).toBe(false);
  });
});
