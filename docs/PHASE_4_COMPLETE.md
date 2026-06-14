# Phase 4: Inventory Management — Completion Report

> Status: ✅ Complete and verified. Ready for Phase 5/6.

This document covers the Inventory Management phase — ingredients with
stock levels, a full audit trail of stock movements, recipes (BOM) linking
menu items to ingredients, automatic stock depletion on POS sales, and a
dashboard with low-stock alerts and stock valuation.

---

## 1. Features completed

- **Ingredients** (`/{tenant}/inventory`), restricted to `owner`, `admin`,
  `manager` — other roles are redirected to the dashboard.
  - Add/edit/delete ingredients: name, unit (kg/g/litre/ml/pieces/dozen/
    packet/box/bottle/tin), minimum stock, cost per unit.
  - New ingredients always start at **0 stock** — the first stock figure is
    itself an audited transaction (a purchase or correction), so nothing is
    ever set "out of band".
  - Per-ingredient card shows current stock, unit cost, computed stock value
    (`current_stock × cost_per_unit`), and a "Low stock" badge.
- **Inventory transactions** — complete, append-only audit trail:
  - **Record movement** — purchase (always increases stock), waste (always
    decreases stock), or adjustment (either direction), with optional unit
    cost (a purchase's unit cost becomes the ingredient's new standard cost)
    and notes.
  - **Correct stock count** — set stock to a known absolute value (e.g.
    after a physical count); the delta is recorded as a `correction`
    transaction.
  - **Sale** transactions are recorded automatically by `place_order()` when
    a POS order depletes ingredient stock per recipe.
  - All five types (`purchase`, `waste`, `adjustment`, `correction`, `sale`)
    show in a unified, color-coded "Recent transactions" feed with the
    quantity change and resulting stock.
- **Recipes / BOM** — assign ingredients (with quantities) to menu items.
  Editing a recipe line's quantity or removing it updates immediately; "every
  ingredient is already in this recipe" is shown once all are assigned.
- **Automatic stock depletion on POS orders** — `place_order()` (extended in
  this phase) sums each ingredient's required quantity across all order
  lines (via the recipe) and depletes `current_stock` atomically with order
  creation, recording one `sale` transaction per affected ingredient.
  - If depletion would take any ingredient negative **and** the tenant has
    not opted into negative stock, the **entire order is rejected** — no
    order, no order items, no KOT entry, no inventory transactions (full
    rollback).
  - **Inventory settings** (owner/admin only): "Allow stock to go negative"
    toggle, stored in `tenants.settings.inventory.allow_negative_stock`
    (default `false`).
- **Inventory dashboard**:
  - Summary cards — ingredient count, low-stock count, total stock value
    (`Σ current_stock × cost_per_unit`).
  - **Low-stock alert banner** — lists every ingredient at or below its
    minimum stock with current/minimum levels.
- **Inventory nav entry** is now live (no "soon" badge) for `owner`,
  `admin`, `manager`; the dashboard's "What's next" roadmap card now lists
  only Phase 6 (accounting/reports).

## 2. Architecture summary

```
supabase/migrations/0009_inventory.sql   schema, RLS, RPCs, place_order() depletion

src/lib/inventory.ts          unit list/labels, transaction-type labels/badges,
                               round3(), parseIngredientForm, parseRecipeLineForm,
                               parseStockMovementForm, parseStockCorrectionForm,
                               isLowStock, stockValue
src/lib/actions/inventory.ts  server actions: createIngredient, updateIngredient,
                               deleteIngredient, createRecipeLine, updateRecipeLine,
                               deleteRecipeLine, recordStockMovement, correctStock,
                               setAllowNegativeStock

src/app/[tenant]/inventory/page.tsx          dashboard: summary cards, alerts,
                                              ingredient/recipe/transaction lists
src/components/inventory/ingredient-manager.tsx  add/edit/delete ingredients,
                                                  record movement / correct stock
src/components/inventory/recipe-manager.tsx      BOM editor per menu item
src/components/inventory/transaction-list.tsx    audit-trail feed
src/components/inventory/inventory-settings.tsx  owner/admin negative-stock toggle
```

- **`ingredients`** — `current_stock` is forced to `0` on insert
  (`ingredients_insert_zero_stock` trigger) and is **not** in the client's
  `UPDATE` grant (`grant update (name, unit, minimum_stock, cost_per_unit)`).
  The only way to move `current_stock` is through the two RPCs below or
  `place_order()`'s depletion step.
- **`inventory_transactions`** — append-only ledger (mirrors the existing
  `audit_log` pattern): no client `INSERT`/`UPDATE`/`DELETE` grants, and an
  `inventory_transactions_no_change` trigger raises on any `UPDATE`/`DELETE`
  even for security-definer callers. `select` is restricted to
  `owner`/`admin`/`manager`.
- **`menu_item_ingredients`** — the recipe/BOM, with a
  `check_recipe_tenant()` trigger (mirroring `check_item_category_tenant`)
  guaranteeing a recipe line's menu item and ingredient belong to the same
  tenant, even though RLS already makes cross-tenant rows invisible.
- **`record_inventory_transaction(tenant, ingredient, type, qty_change,
  unit_cost?, notes?)`** — security-definer RPC for purchase/waste/
  adjustment. Validates role + license + sign conventions (purchase > 0,
  waste < 0), locks the ingredient row (`for update`), rejects negative
  results unless `allow_negative_stock` is set, updates `current_stock`
  (and `cost_per_unit` for purchases with a unit cost), and inserts the
  ledger row — all in one transaction.
- **`correct_stock(tenant, ingredient, new_stock, notes?)`** — security-
  definer RPC for absolute corrections; computes the delta, rejects negative
  targets, and inserts a `correction` row.
- **`place_order(...)`** — same contract as Phase 1's `0005_orders.sql`
  (server-side repricing, sequential order numbering, snapshot order_items),
  with a new final step: for every distinct ingredient referenced by the
  order's recipe lines, lock the ingredient row, compute the new stock, and
  either raise (rolling back the whole order, including order_items and the
  order row itself) or apply the depletion and insert a `sale` transaction
  referencing the order.
- **Numeric conventions**: stock quantities use `numeric(12,3)` and
  `round3()` (3 decimals); money (`cost_per_unit`, `unit_cost`, stock value)
  uses `numeric(12,2)` and the existing `round2()` from `lib/menu.ts`.

## 3. Migrations applied

`supabase/migrations/0009_inventory.sql` — applied to the linked Supabase
project via `npx supabase db push` during development. Adds:
- `inventory_transaction_type` enum (`purchase`, `waste`, `adjustment`,
  `correction`, `sale`)
- `ingredients`, `inventory_transactions`, `menu_item_ingredients` tables
  with RLS policies, indexes, and triggers
- `record_inventory_transaction()`, `correct_stock()` RPCs
- `place_order()` replaced with the stock-depletion-aware version

## 4. Verification steps performed

- **Full verification suite**, all green:
  - `npm run lint` ✅ (0 errors; 2 pre-existing unrelated warnings in
    `src/lib/actions/staff.ts`)
  - `npm run typecheck` ✅
  - `npm run test` ✅ — 88/88 passed (10 files, incl. new
    `inventory.test.ts` with 18 tests covering `round3`, all four form
    parsers, `isLowStock`, and `stockValue`)
  - `npm run build` ✅ — new route `/[tenant]/inventory` (7.17 kB, 119 kB
    First Load JS) compiled successfully
- **End-to-end test** against the live dev server and linked Supabase
  project, signed in as `owner` on tenant `aadhithyas-kitchen`:
  1. Created ingredient "Basmati Rice" (kg, min stock 5, cost ₹120/kg) —
     starts at 0 stock, immediately flagged "Low stock".
  2. Recorded a **Purchase** of 50 kg — stock → 50 kg, value ₹6,000, low-stock
     badge cleared, audit entry "+50 kg now 50 kg".
  3. Built a recipe: Coffee menu item requires 0.25 kg Basmati Rice.
  4. Placed a POS order for 1 Coffee (₹126 total) → **Order #10** created;
     stock automatically depleted to 49.75 kg (value ₹5,970), audit entry
     "Sale -0.25 kg now 49.75 kg".
  5. Used **Correct stock count** to set Basmati Rice to 0.1 kg — audit entry
     "Correction -49.65 kg now 0.1 kg", low-stock badge and alert banner
     reappear ("Basmati Rice — 0.1 / 5 kg").
  6. With `allow_negative_stock = false` (default), placed another POS order
     for Coffee → **rejected** inline with
     `insufficient stock for "Basmati Rice": need 0.250 kg, only 0.100 left`.
     Confirmed **no** new order, order items, KOT entry, or inventory
     transaction were created (full rollback) — orders list still showed
     #10 as latest, transaction feed unchanged.
  7. Toggled **"Allow stock to go negative"** on in Inventory Settings, then
     placed a POS order for 2 Coffees → **Order #11** succeeded, stock went
     to **-0.4 kg** (value -₹48.00), audit entry "Sale -0.5 kg now -0.4 kg",
     and the low-stock alert showed "Basmati Rice — -0.4 / 5 kg".
  8. Reset test state afterward: toggled "Allow stock to go negative" back
     off (default) and applied a final stock correction of Basmati Rice to
     0 kg (noted "reset after Phase 4 verification testing") so the live
     tenant is left in a clean, predictable state.

## 5. Commit hashes

| Commit | Description |
|---|---|
| `a281a2d` | Phase 4: inventory data model, helpers and server actions |
| `a791d37` | Phase 4: inventory dashboard UI |
| `a2984f5` | Phase 4: enable Inventory nav entry and update dashboard roadmap |
| _(this commit)_ | docs: add Phase 4 completion report |

All pushed to `origin/main`.

## 6. Known limitations / notes

- The dev server periodically logs
  `TimeoutError: The operation was aborted due to timeout` from
  `src/lib/supabase/middleware.ts` (a 5-second session-refresh fetch). This
  is pre-existing fallback behavior (not introduced by this phase) — the
  app continues to function correctly using the existing session/cookies.
- Stock corrections and purchases reject negative *targets* outright
  (`correct_stock` requires `new_stock >= 0`); only `place_order()`'s
  depletion and `record_inventory_transaction()`'s adjustments can drive
  stock negative, and only when `allow_negative_stock` is enabled.
- `menu_item_ingredients` has no UI for bulk-editing recipes across many
  menu items at once — each menu item's recipe is edited individually.

## 7. Remaining phases

- **Accounting + reports** (Phase 6) — day books, tax, P&L, PDF/Excel
  exports.

(Core foundation, POS/menu management, KOT, Staff management, Orders &
Receipts, and now Inventory Management are complete.)

## 8. Local setup instructions

1. **Clone and install**
   ```bash
   git clone https://github.com/Aadhithyag15/restaurant-erp-saas.git
   cd restaurant-erp-saas
   npm install
   ```
2. **Environment**: copy `.env.example` → `.env.local` and fill in your
   Supabase project's URL/anon key from Settings → API.
3. **Database**: apply migrations, including the new
   `0009_inventory.sql`:
   ```bash
   npx supabase db push
   ```
4. **Run the app**
   ```bash
   npm run dev
   ```
   Visit `http://localhost:3000`, sign in, and navigate to
   `/{tenant-slug}/inventory` (with an `owner`/`admin`/`manager` role) to
   manage ingredients, recipes, and stock transactions. Placing a POS order
   for an item with a recipe will automatically deplete stock.
5. **Verify everything**
   ```bash
   npm run lint
   npm run typecheck
   npm run test
   npm run build
   ```
