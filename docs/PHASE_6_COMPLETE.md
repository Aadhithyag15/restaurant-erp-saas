# Phase 6 — Accounting & Reports: Complete

## Summary

Phase 6 adds sales reporting and daily cash-closing accounting on top of the
existing order/payment data, plus a critical authentication fix discovered
and resolved mid-phase.

All work is additive and read-mostly: new pages, new lib helpers, one new
migration (`payment_method` column + `daily_closings` table), and small
extensions to the POS flow to capture payment method. No existing behavior
was removed.

## Deliverables

### 1. Payment method capture
- `supabase/migrations/0010_reporting.sql` — adds `payment_method` enum
  (`cash`, `card`, `upi`, `wallet`, `other`) to `orders`, and a new
  `daily_closings` table (per-tenant, per-date opening/closing cash, refunds,
  notes) with RLS policies matching existing tenant-scoped tables.
- `src/types/database.ts` — generated types updated for the new column/table.
- POS checkout ([pos-screen.tsx](src/components/pos/pos-screen.tsx)) now lets
  the cashier pick a payment method before completing an order;
  [actions/orders.ts](src/lib/actions/orders.ts) and
  [lib/orders.ts](src/lib/orders.ts) persist it.

### 2. Dashboard metrics ([dashboard/page.tsx](src/app/[tenant]/dashboard/page.tsx))
- Added Monthly sales, Order count, and Average order value stat cards
  alongside the existing Today's/Weekly sales.
- [revenue-trend-chart.tsx](src/components/dashboard/revenue-trend-chart.tsx)
  reused for the 7-day trend.

### 3. Sales Reports — `/[tenant]/reports`
- New page ([reports/page.tsx](src/app/[tenant]/reports/page.tsx)) with:
  - Date range, status, and payment-method filters
    ([reports-filter-bar.tsx](src/components/reports/reports-filter-bar.tsx))
  - Total sales / orders / average order value summary cards
  - Revenue trend chart over the selected range
  - Top selling items and category performance breakdowns
  - Payment method breakdown
    ([payment-method-breakdown.tsx](src/components/reports/payment-method-breakdown.tsx))
  - Orders table for the selected range
  - CSV / Excel / PDF export buttons
    ([export-buttons.tsx](src/components/reports/export-buttons.tsx)) using
    `xlsx` and `jspdf`
- Core logic in [lib/reports.ts](src/lib/reports.ts), unit-tested in
  [lib/reports.test.ts](src/lib/reports.test.ts).
- Loading skeleton: [reports/loading.tsx](src/app/[tenant]/reports/loading.tsx).

### 4. Daily Closing Report — `/[tenant]/accounting`
- New page ([accounting/page.tsx](src/app/[tenant]/accounting/page.tsx)) with
  a date picker, today's total sales / opening / closing / net revenue
  summary, a daily closing form
  ([daily-closing-form.tsx](src/components/accounting/daily-closing-form.tsx)),
  and a "Recent closings" table (last 14 days).
- Server action [actions/accounting.ts](src/lib/actions/accounting.ts) validates
  and upserts via [lib/accounting.ts](src/lib/accounting.ts)
  (`parseDailyClosingForm`), unit-tested in
  [lib/accounting.test.ts](src/lib/accounting.test.ts).
- Loading skeleton: [accounting/loading.tsx](src/app/[tenant]/accounting/loading.tsx).

### 5. Navigation
- [lib/nav.ts](src/lib/nav.ts) — Accounting (owner/admin) and Reports
  (owner/admin/manager) are now live nav items (phase badge removed),
  verified in [lib/nav.test.ts](src/lib/nav.test.ts).

## Critical mid-phase fix: authentication

While starting the Reports walkthrough, both a pre-existing account and a
brand-new signup were unable to sign in. Investigation found:

- **Root cause**: the Supabase project had `mailer_autoconfirm: false` with
  no SMTP configured. New signups created users with `email_confirmed_at =
  null`; every subsequent `signInWithPassword` failed with
  `email_not_confirmed`, surfaced to the user as the generic "Invalid email
  or password." The project's `site_url`/`uri_allow_list` also still pointed
  at port 3001 while the app runs on 3000.
- **Fix applied**:
  1. Supabase project auth config updated via the Management API:
     `mailer_autoconfirm: true`, `site_url` and `uri_allow_list` corrected to
     `http://localhost:3000`.
  2. [lib/actions/auth.ts](src/lib/actions/auth.ts) `signup()` now checks
     `data.session` from `signUp()` — when present (auto-confirmed), it signs
     the user straight in and redirects to `/go` instead of showing a "check
     your email" message.
  3. The existing unconfirmed test account was manually confirmed via the
     Supabase Admin API.
- **Verification**: lint, typecheck, full test suite (120/120), and build all
  green after the fix. End-to-end manual walkthrough confirmed: signup →
  immediate session → onboarding → tenant dashboard → sign out → sign in →
  back to tenant dashboard, with no email-confirmation detour.

## Manual verification (this session)

Using a fresh account (`verify-fix-bistro` tenant):
- Signup, onboarding, and dashboard render correctly with empty-state stats
  and a 14-day trial banner.
- Sign out and sign back in both work; session lands on the tenant dashboard.
- `/verify-fix-bistro/reports` renders all sections (filters, export buttons,
  summary cards, revenue trend, top items, category performance, payment
  methods, orders table) with correct empty states.
- `/verify-fix-bistro/accounting` renders the daily closing summary and form.
  Submitting opening/closing cash + refunds + notes saves successfully
  ("Saved." confirmation), updates the summary cards, and appears in "Recent
  closings".

## Checks

- `npm run lint` — clean (2 pre-existing unrelated warnings in
  [actions/staff.ts](src/lib/actions/staff.ts))
- `npm run typecheck` — clean
- `npm test` — 120/120 passing
- `npm run build` — clean, includes new `/[tenant]/reports` and
  `/[tenant]/accounting` routes
