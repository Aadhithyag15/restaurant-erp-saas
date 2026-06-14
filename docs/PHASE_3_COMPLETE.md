# Phase 3: Orders & Receipts — Completion Report

> Status: ✅ Complete and verified. Ready for Phase 4.

This document covers the Orders & Receipts phase — a tenant-wide order
history with search/filter/pagination, full order details with a status
timeline, printable receipts (and reprints), and real metrics on the
dashboard.

---

## 1. Features completed

- **Orders list page** (`/{tenant}/orders`), restricted to `owner`, `admin`,
  `manager`, and `cashier` roles — other roles are redirected to the
  dashboard.
  - Lists every order for the tenant, newest first, 20 per page.
  - **Search by order number** (`?q=`) — exact match on `order_number`;
    non-numeric input short-circuits to "no results" without hitting the
    database.
  - **Status filter** (`?status=`) — pending / preparing / ready / served.
  - **Date filter** (`?date=`) — filters to a single tenant-local calendar
    day, computed via the new timezone helper (handles non-UTC, non-DST
    timezones like `Asia/Kolkata` correctly).
  - **Pagination** — Previous/Next controls that preserve all active filters,
    backed by PostgREST `.range()` + `{ count: "exact" }`.
  - All filtering/pagination is server-rendered via URL search params; a
    small client component (`OrdersFilterBar`) auto-submits on
    status/date change.
- **Order details page** (`/{tenant}/orders/[id]`):
  - Header with order number, status badge, and a "Print receipt" /
    "Reprint receipt" link (label depends on whether the order is `served`).
  - **Status timeline** (`OrderStatusTimeline`) — 4-step
    pending → preparing → ready → served stepper, showing the placed time on
    the first step and the last-updated time on the current step.
  - Order information card — placed time, source (dine-in/takeaway/delivery
    label via the shared `sourceLabel` helper), customer name/phone (if set),
    who placed the order, and any notes.
  - Items card — qty × name with veg/non-veg marker, unit price and tax rate,
    line totals, and a subtotal/tax/total footer.
- **Receipt page** (`/{tenant}/orders/[id]/receipt`):
  - Restaurant-style printable receipt: tenant name, outlet address (if set),
    order number/date/customer/source, itemized table, subtotal/tax/total,
    and a "Thank you, visit again!" footer.
  - **Print button** calls `window.print()`; the button itself and the
    surrounding chrome (sidebar, mobile header, trial banner, back link) are
    hidden via Tailwind's `print:hidden` variant so only the receipt prints.
  - **Reprint** is just the same page — the "Reprint receipt" link from the
    order details page for `served` orders points here.
- **Dashboard now shows real data** instead of placeholders:
  - **Today's sales** — sum of `total` for orders placed since local
    midnight (tenant timezone).
  - **Today's orders** — count of orders placed today.
  - **Active kitchen orders** — count of orders in `pending`, `preparing`,
    or `ready`.
  - **Revenue (7 days)** — sum of `total` for the trailing 7-day window
    (tenant-local).
  - Existing License / Team / Outlets cards and "What's next" roadmap card
    are unchanged.
- **Orders nav entry** added between "Kitchen (KOT)" and "Staff" for
  `owner`, `admin`, `manager`, `cashier`.

## 2. Architecture summary

```
src/lib/timezone.ts        tenant-local "today" + day-range → UTC helpers
src/lib/orders.ts           status labels/badges, pagination size,
                             query-param parsing, sourceLabel (moved from KOT)

src/app/[tenant]/orders/page.tsx              list: search/filter/paginate
src/app/[tenant]/orders/[id]/page.tsx         details: timeline, items, totals
src/app/[tenant]/orders/[id]/receipt/page.tsx printable receipt

src/components/orders/status-badge.tsx        shared status pill
src/components/orders/order-status-timeline.tsx 4-step stepper
src/components/orders/orders-filter-bar.tsx   "use client" filter form
src/components/orders/print-receipt-button.tsx "use client" window.print()
```

- **`src/lib/timezone.ts`** — `todayInTimeZone(tz)` returns the current date
  (YYYY-MM-DD) in the tenant's IANA timezone; `localDayRangeUtc(date, tz)`
  returns the `[start, end)` UTC instants for that local calendar day. Used
  by the orders date filter and the dashboard's "today"/7-day windows.
  Computes the UTC offset via a `toLocaleString` comparison trick — no date
  library needed, verified against `Asia/Kolkata` (+5:30, no DST), `UTC`, and
  `America/New_York` (handles DST) in `timezone.test.ts`.
- **`src/lib/orders.ts`** — single source of truth for order status labels
  (`ORDER_STATUS_LABELS`), badge color classes (`ORDER_STATUS_BADGE_CLASS`),
  page size (`ORDERS_PAGE_SIZE = 20`), and search-param parsing helpers
  (`parseOrderNumberQuery`, `parsePageParam`, `parseStatusFilter`,
  `parseDateFilter`). `sourceLabel` was moved here from
  `kitchen-screen.tsx` so KOT and Orders share one implementation.
- **Reads only** — all three pages query `orders`/`order_items` directly
  through the existing `orders_select`/`order_items_select` RLS policies
  (`to authenticated using (is_member(tenant_id))`). No new writes, no new
  RPCs, no new migrations — Phase 3 is purely additive on top of the
  `0005_orders.sql` schema from Phase 1.
- **Print layout reuses the existing `[tenant]` layout** (sidebar + trial
  banner) rather than a separate route group. Chrome is hidden for print via
  Tailwind's built-in `print:hidden` (sidebar, mobile header, trial banner,
  receipt's own back/print bar) and `print:p-0` on `<main>` — no custom CSS
  added to `globals.css`.

## 3. Migrations applied

None. This phase is read-only against the existing `orders`/`order_items`
tables and RLS policies from `0005_orders.sql` (Phase 1).

## 4. Verification steps performed

- **End-to-end test** against the live dev server and linked Supabase
  project, signed in as `owner` on tenant `aadhithyas-kitchen`:
  - **Dashboard**: confirmed all four new metric cards render with real
    data — Today's sales ₹5,040.00 across 9 orders, Today's orders 9,
    Active kitchen orders 7, Revenue (7 days) ₹5,040.00 across 9 orders —
    alongside the unchanged License/Team/Outlets cards.
  - **Orders list**: all 9 orders listed newest-first with correct dates
    (tenant timezone), status badges, and amounts.
    - `?q=5` → only Order #5 returned (order-number search).
    - `?status=served` → only the two `served` orders (#9, #1) returned.
    - `?date=2026-06-13` (a day with no orders) →
      "No orders match these filters."
  - **Order details**: opened Order #9 — status timeline shows Pending
    (placed 5:41 pm) through Served (5:42 pm), order info (source, placed
    by), items (9 × Coffee, ₹120.00 each, 5% tax), and
    subtotal/tax/total = ₹1,080.00 / ₹54.00 / ₹1,134.00. "Reprint receipt"
    link shown (order is `served`).
  - **Receipt page**: printable receipt renders tenant name, order #9,
    date, itemized table, and totals; confirmed `print:hidden` is applied
    to the sidebar, mobile header, and the receipt's back/reprint bar so
    only the receipt content would print.
- **Full verification suite**, all green:
  - `npm run lint` ✅ (0 errors; 2 pre-existing unrelated warnings in
    `src/lib/actions/staff.ts`)
  - `npm run typecheck` ✅
  - `npm run test` — 69/69 ✅ (9 files, incl. new `timezone.test.ts` and
    `orders.test.ts`)
  - `npm run build` ✅ — new routes `/[tenant]/orders`,
    `/[tenant]/orders/[id]`, `/[tenant]/orders/[id]/receipt` all compiled.

## 5. Commit hashes

| Commit | Description |
|---|---|
| `fd43d32` | Phase 3: Orders & Receipts — list, details, printable receipts |
| `3ba6e34` | Phase 3: wire real order metrics into the dashboard |
| _(this commit)_ | docs: add Phase 3 completion report |

All pushed to `origin/main`.

## 6. Remaining phases

- **Inventory + SKU management** (Phase 5) — stock, recipes/BOM, depletion on
  sale, low-stock alerts.
- **Accounting + reports** (Phase 6) — day books, tax, P&L, PDF/Excel
  exports.

(Core foundation, POS/menu management, KOT, Staff management, and now Orders
& Receipts are complete.)

## 7. Local setup instructions

1. **Clone and install**
   ```bash
   git clone https://github.com/Aadhithyag15/restaurant-erp-saas.git
   cd restaurant-erp-saas
   npm install
   ```
2. **Environment**: copy `.env.example` → `.env.local` and fill in your
   Supabase project's URL/anon key from Settings → API.
3. **Database**: ensure all migrations in `supabase/migrations/` are applied
   to your linked Supabase project (no new migrations in this phase):
   ```bash
   npx supabase db push
   ```
4. **Run the app**
   ```bash
   npm run dev
   ```
   Visit `http://localhost:3000`, sign in, and navigate to
   `/{tenant-slug}/orders` (with an `owner`/`admin`/`manager`/`cashier` role)
   to view the order list, drill into an order, and print/reprint a receipt.
5. **Verify everything**
   ```bash
   npm run lint
   npm run typecheck
   npm run test
   npm run build
   ```
