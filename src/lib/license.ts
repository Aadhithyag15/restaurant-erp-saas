/**
 * Client-side mirror of the database's tenant_is_active() — the database is
 * the enforcement point (RLS); this only drives UI states (banner, wall).
 */
export type SubscriptionLike = {
  status: string;
  trial_ends_at: string | null;
  current_period_end: string | null;
} | null;

export type License = {
  isActive: boolean;
  state: "trialing" | "active" | "expired" | "none";
  /** whole days remaining in trial (ceil); null outside trials */
  daysLeft: number | null;
};

const DAY_MS = 86_400_000;

export function deriveLicense(sub: SubscriptionLike, now: Date = new Date()): License {
  if (!sub) return { isActive: false, state: "none", daysLeft: null };

  if (sub.status === "trialing") {
    const ends = sub.trial_ends_at ? new Date(sub.trial_ends_at) : null;
    if (ends && ends.getTime() > now.getTime()) {
      return {
        isActive: true,
        state: "trialing",
        daysLeft: Math.ceil((ends.getTime() - now.getTime()) / DAY_MS),
      };
    }
    return { isActive: false, state: "expired", daysLeft: 0 };
  }

  if (sub.status === "active") {
    const end = sub.current_period_end ? new Date(sub.current_period_end) : null;
    if (!end || end.getTime() > now.getTime()) {
      return { isActive: true, state: "active", daysLeft: null };
    }
  }

  return { isActive: false, state: "expired", daysLeft: 0 };
}
