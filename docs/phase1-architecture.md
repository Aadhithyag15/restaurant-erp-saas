# Restaurant Flow SaaS — Phase 1: Foundation & Architecture

> Status: awaiting founder approval before Phase 2.
> Scope of this document: architecture, stack, tenancy, auth, RLS, licensing/trial, env, setup.
> Explicitly out of scope: POS, KOT, inventory, SKU, accounting code (later phases).

---

## 1. Overall system architecture

```
                        ┌──────────────────────────────────────────┐
                        │              Browser / PWA               │
                        │  Next.js App (desktop / tablet / mobile) │
                        └───────────────┬──────────────────────────┘
                                        │ HTTPS
              ┌─────────────────────────┼──────────────────────────┐
              │                         │                          │
   ┌──────────▼──────────┐   ┌──────────▼──────────┐   ┌───────────▼──────────┐
   │  Static + SSR pages │   │  Route Handlers /   │   │  Supabase JS client  │
   │  (Cloudflare Pages/ │   │  Server Actions     │   │  (anon key + RLS)    │
   │   Vercel edge)      │   │  (service ops only) │   │  direct to Supabase  │
   └─────────────────────┘   └──────────┬──────────┘   └───────────┬──────────┘
                                        │                          │
                        ┌───────────────▼──────────────────────────▼───────┐
                        │                  SUPABASE (free tier)            │
                        │  • Postgres (multi-tenant, RLS on every table)   │
                        │  • Auth (email/password, magic link, invites)    │
                        │  • Storage (logos, export archives) — later      │
                        │  • pg_cron (trial expiry, housekeeping)          │
                        │  • Realtime (KOT order push) — Phase 3           │
                        └───────────────────────────────────────────────────┘
```

**Key principles**

1. **Database is the security boundary.** Every business rule that matters (tenancy, roles, license status, override code, immutable history) is enforced in Postgres via RLS + `security definer` functions — never only in the UI. (Same principle as the proven Chicken Story POS build, upgraded from PHP checks to RLS.)
2. **Thin backend.** The browser talks to Supabase directly with the anon key; RLS makes that safe. Next.js server code is only used where the service-role key is required (tenant provisioning, billing webhooks later, exports that aggregate across roles).
3. **Exports are client-side.** PDF (jsPDF + autotable) and Excel (SheetJS/xlsx) are generated in the browser from the same queried data — zero server cost, works on free tier forever.
4. **Offline-tolerant POS (Phase 2+).** Cart and in-flight orders persist to localStorage/IndexedDB so a refresh or dropped connection never loses a bill.

## 2. Recommended tech stack (all free tier)

| Layer | Choice | Why |
|---|---|---|
| Frontend | **Next.js 15 (App Router) + TypeScript** | SSR for marketing/auth pages, SPA-feel for POS; huge ecosystem |
| UI | **Tailwind CSS + shadcn/ui** | Fast, themeable (CSS variables, white-primary default), fully responsive; SVG icons via `lucide-react`, no emojis |
| State/data | **TanStack Query + Supabase JS v2** | Caching, optimistic updates for POS taps |
| Database | **Supabase Postgres (free)** | 500 MB DB, RLS, Auth, Realtime, pg_cron — everything in one free service |
| Auth | **Supabase Auth** | Email/password + magic-link; JWT carries user id; roles resolved from `memberships` |
| Hosting | **Cloudflare Pages (free)** — primary recommendation | Unlimited bandwidth, **commercial use allowed on free plan**. ⚠️ Vercel Hobby prohibits commercial use; use Vercel only if you upgrade to Pro later. Netlify free is the fallback. |
| PDF export | **jsPDF + jspdf-autotable** (client-side) | Free, no server |
| Excel export | **SheetJS (`xlsx`) or `exceljs`** (client-side) | Free, real .xlsx output |
| Scheduled jobs | **pg_cron inside Supabase** | Trial expiry, cleanup — no external cron service needed |
| Payments (Phase 5) | Razorpay (INR) or Stripe | Decide later; schema is already payment-provider-agnostic |

**Free-tier caveats to plan around**
- **Supabase free has NO automatic backups.** Mitigated from day one: a nightly `pg_dump` via free GitHub Actions ([.github/workflows/db-backup.yml](../.github/workflows/db-backup.yml)) into 30-day private artifacts. The same nightly connection also prevents the free project from **auto-pausing after ~7 idle days**.
- **Capacity honesty (500-restaurant target):** at ~100 orders/day per restaurant, 500 restaurants ≈ 50k orders/day → roughly 100–250 MB/month of order data. The 500 MB free database carries development plus the first ~10–20 pilot customers; **Supabase Pro ($25/mo, includes daily backups + no pausing) is your first mandatory cost at real traction** — revenue from ~2 customers covers it. Postgres + these indexes are comfortably fine at 500 restaurants; nothing architectural changes, only the plan tier.
- Free-tier direct connections are limited (~60) — irrelevant for the app (PostgREST pools internally), but external tools (backups, BI) must use the **session pooler** connection string.
- One Supabase free project per product. All tenants share one database (see §5) — that's the standard SaaS pattern and exactly what RLS is for.

## 3. Project folder structure

```
restaurant-erp/
├─ docs/
│  └─ phase1-architecture.md        ← this document
├─ supabase/
│  ├─ migrations/
│  │  └─ 0001_foundation.sql        ← Phase 1 schema + RLS (ready to run)
│  └─ seed.sql                      ← plans seed (later: demo data)
├─ src/
│  ├─ app/
│  │  ├─ (marketing)/               # public: landing, pricing, signup
│  │  ├─ (auth)/                    # login, signup, invite-accept, reset
│  │  ├─ (app)/[tenant]/            # everything below is tenant-scoped
│  │  │  ├─ dashboard/
│  │  │  ├─ pos/                    # Phase 2
│  │  │  ├─ kot/                    # Phase 3
│  │  │  ├─ inventory/              # Phase 4 (includes SKUs)
│  │  │  ├─ accounting/             # Phase 5
│  │  │  ├─ reports/                # exports live here
│  │  │  └─ settings/               # staff, roles, license, edit-code
│  │  └─ api/                       # service-role-only route handlers
│  ├─ components/                   # ui/ (shadcn), pos/, shared/
│  ├─ lib/
│  │  ├─ supabase/                  # browser client, server client, middleware
│  │  ├─ license.ts                 # trial/active gate helpers
│  │  └─ export/                    # pdf.ts, excel.ts (shared export engine)
│  ├─ hooks/
│  └─ types/                        # generated DB types (supabase gen types)
├─ middleware.ts                    # auth + license gate on (app) routes
├─ .env.local                       # never committed
└─ .env.example
```

URL shape: `app.yourdomain.com/{tenant-slug}/pos` — path-based tenancy (free; subdomain-per-tenant needs paid DNS wildcard handling and adds nothing at this stage). Every page is deep-linkable and refresh-safe (Next.js routing gives us this for free — same goal as the `.htaccess` trick in the old PHP build).

## 4. Supabase database schema (Phase 1)

Full DDL in [`supabase/migrations/0001_foundation.sql`](../supabase/migrations/0001_foundation.sql). Summary:

| Table | Purpose |
|---|---|
| `tenants` | One row per restaurant business. Slug (reserved app routes blocked), currency (default INR), timezone, themable settings JSON, `created_by` (trial-abuse accounting) |
| `tenant_secrets` | Manager override code as bcrypt hash. RLS enabled with **zero client policies** — no client can ever read even the hash; only `security definer` functions touch it |
| `outlets` | Locations under a tenant (single outlet auto-created; chains later) |
| `profiles` | 1:1 with `auth.users`; display name, phone. Auto-created by trigger |
| `memberships` | user ↔ tenant with `role` enum: `owner` `admin` `manager` `cashier` `kitchen`; `is_active` for disabling staff without deleting history |
| `invitations` | Token-based staff invites (email, role, 7-day expiry) |
| `plans` | `trial`, `standard`, `pro` — price + JSON `limits` (max outlets, max staff…) |
| `subscriptions` | One per tenant. `status`: `trialing → active → past_due → canceled/expired`; `trial_ends_at` = signup + 14 days |
| `audit_log` | **Append-only** change history (who/when/action/old→new, per tenant). SELECT for admin/manager only; **no client INSERT at all** (entries can't be fabricated) — writes happen only inside trusted definer functions. No UPDATE/DELETE policy exists, and a trigger blocks them even for definer functions |

All future tables (menu items/SKUs, orders, order_items, stock, ledgers…) will follow the same contract: `tenant_id uuid not null references tenants` + the standard RLS policy set, so Phase 2+ tables drop in without rethinking security.

## 5. Multi-tenant design

**Model: shared database, shared schema, `tenant_id` column + RLS.** (Industry default for SaaS at this scale; schema-per-tenant doesn't fit Supabase free and complicates migrations.)

- Every tenant-owned table has `tenant_id` with an index; every query is automatically filtered by RLS — even a buggy client query can't leak another restaurant's data.
- A user can belong to multiple tenants (e.g., an accountant serving two restaurants); the active tenant is whatever slug is in the URL, validated server-side by membership.
- Tenant provisioning is one atomic RPC (`create_tenant_with_trial`) — tenant + default outlet + owner membership + trialing subscription in a single transaction, so there is never a half-created account.
- Per-tenant theming via `tenants.settings` JSON → CSS variables (white-primary default, accent configurable).

## 6. Authentication flow

```
SIGNUP (founder of a restaurant)
  1. /signup → Supabase Auth email+password (email confirmation on)
  2. On first login → "Create your restaurant" form (name, slug, currency)
  3. Calls rpc create_tenant_with_trial(name, slug)   [security definer, atomic]
       → tenants + outlets + memberships(owner) + subscriptions(trialing, +14d)
  4. Redirect to /{slug}/dashboard

STAFF (cashier / kitchen / manager)
  1. Admin creates invite in Settings → invitations row (role, token)
  2. Staff opens invite link → signs up / logs in → rpc accept_invitation(token)
       → memberships row created with the invited role
  3. Cashiers land on POS only; role decides both UI and (via RLS) what the DB permits

EVERY REQUEST
  • Supabase JWT (auth.uid()) → RLS resolves membership + role + license per query
  • Next.js middleware additionally gates (app)/ routes: not logged in → /login;
    license expired → /{slug}/billing (read-only data access still allowed — see §8)

SENSITIVE EDITS (price change, order-total edit, etc. — Phase 2+)
  • UI modal collects the override code → rpc verify_edit_code(tenant_id, code)
    compares against the bcrypt hash in tenant_secrets (a table no client can read).
    Brute-force lockout: 5 failed attempts per user per tenant in 15 minutes —
    counted from the immutable audit log itself, so it can't be reset client-side.
    Every attempt is audited; the code is never stored client-side, never echoed,
    never logged, never in the JWT.
```

## 7. Row Level Security policies

Design (full SQL in the migration):

- **`is_member(tenant_id)`**, **`has_role(tenant_id, roles[])`**, **`tenant_is_active(tenant_id)`** — `security definer` helper functions (avoids recursive-RLS pitfalls on `memberships`, keeps policies one-liners).
- **`tenants`**: SELECT for members; UPDATE only `owner|admin`; INSERT/DELETE only via RPC (no direct policy).
- **`memberships`**: members can read their tenant's roster; only `owner|admin` manage staff. Two escalation guards: rows whose role is `owner` can only be modified/deleted by an owner (an admin cannot demote or disable the boss), and nobody can *grant* `owner` unless they are one. Users can always read their own rows (bootstrap).
- **`subscriptions` / `plans`**: members read their own subscription (to show trial banner); **no client write policy at all** — billing status changes only via service-role/webhooks/pg_cron.
- **`audit_log`**: SELECT (admin/manager) only. **No client INSERT** — entries are written exclusively by definer functions, so a member can't fabricate history. No UPDATE/DELETE policy **plus** a `BEFORE UPDATE OR DELETE` trigger that raises — immutable in depth, matching the "history can only be touched by direct DB operation" rule from the reference build.
- **`tenant_secrets`**: RLS enabled, zero policies — completely invisible to clients in both directions.
- **Write-gating on license**: every write policy includes `tenant_is_active(tenant_id)` in **both** `using` and `with check` — when a trial lapses, the tenant loses INSERT *and* UPDATE/DELETE at the database level. Expiry can't be bypassed by a crafted client.
- **Privilege hardening beneath RLS**: `anon` is revoked from everything except `plans` (including via default privileges for future tables); `authenticated` has no grants on tables with no legitimate client write path, and `tenants` updates are **column-scoped** (`name, currency, timezone, settings`) so a client can never alter `slug` or `created_by` even through an over-broad future policy.

## 8. Licensing & 14-day trial

- Signup ⇒ `subscriptions(status='trialing', trial_ends_at = now() + 14 days)`. No card required.
- **Expiry is exact, not cron-dependent**: `tenant_is_active()` checks `trial_ends_at`/`current_period_end` directly on every query, so access cuts off at the precise timestamp even if the cron hasn't run yet. The **daily `pg_cron` job** flipping `trialing → expired` is bookkeeping for UI states and emails.
- **Trial-abuse guards** (in `create_tenant_with_trial`): `tenants.created_by` tracks who provisioned; one trial per account — a second restaurant requires all existing tenants to be paid-active; hard cap of 5 owned tenants; reserved slugs (`api`, `login`, `pos`, …) rejected so path-based routing can't be shadowed.
- **Grace behaviour (recommended):** expired tenants keep **read + export** access but lose writes (RLS-enforced, §7). Customers can always get their data out — that's a selling point and likely a legal expectation; it also means "expired" never destroys anything.
- UI: persistent trial countdown banner from day 10; expired ⇒ redirect writes-pages to `/{slug}/billing`.
- Phase 5 adds Razorpay/Stripe: webhook (service role) sets `active` + `current_period_end`; the same pg_cron job handles `past_due → expired`. The schema needs no changes.

## 9. Environment variables

```bash
# .env.example
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...        # safe to expose; RLS is the guard
SUPABASE_SERVICE_ROLE_KEY=eyJ...            # SERVER ONLY — never NEXT_PUBLIC_, never in client bundles
NEXT_PUBLIC_APP_URL=https://app.yourdomain.com
CRON_SECRET=<random-32-chars>               # protects any app-side maintenance endpoints
# Phase 5 (placeholders, unused for now):
# RAZORPAY_KEY_ID= / RAZORPAY_KEY_SECRET= / RAZORPAY_WEBHOOK_SECRET=
```

Secrets live in Cloudflare Pages/Vercel project settings, never in git. The per-tenant override code is **not** an env var — it's per-tenant, bcrypt-hashed in `tenants.edit_code_hash`.

## 10. Setup instructions

1. **Supabase**: create free project at supabase.com → SQL Editor → run `supabase/migrations/0001_foundation.sql` (creates schema, RLS, RPCs, seed plans, cron job). Auth → Providers: enable Email, keep "Confirm email" on. Auth → URL config: add your app URL + `http://localhost:3000`.
2. **App scaffold** (Phase 2 start): `npx create-next-app@latest restaurant-erp --typescript --tailwind --app`, then `npm i @supabase/supabase-js @supabase/ssr @tanstack/react-query`, `npx shadcn@latest init`.
3. **Types**: `npx supabase gen types typescript --project-id <ref> > src/types/database.ts` (rerun after every migration).
4. **Local env**: copy `.env.example` → `.env.local`, paste keys from Supabase → Settings → API.
5. **Deploy**: push to a **private** GitHub repo → connect in Cloudflare Pages (framework preset: Next.js) → add the env vars → deploy.
6. **Backups**: add repo secret `SUPABASE_DB_URL` (session-pooler string) — the included [db-backup.yml](../.github/workflows/db-backup.yml) then dumps the DB nightly to a 30-day artifact. Run it once manually (workflow_dispatch) and confirm the artifact appears.
7. **Verify Phase 1** (no POS yet): sign up, confirm `create_tenant_with_trial` produced tenant/outlet/membership/subscription rows; a second `create_tenant_with_trial` from the same account is rejected (trial guard); slug `pos` is rejected (reserved); second account cannot read the first tenant's rows (RLS impersonation test in SQL editor); `select * from tenant_secrets` returns zero rows as authenticated; 5 wrong `verify_edit_code` calls lock the 6th; `update audit_log …` fails even as service role.

---

## 11. Launch-readiness review (CTO pass, rev 2)

Findings from a pre-Phase-2 security/scale review; **all fixed in the current migration**:

| # | Finding | Severity | Resolution |
|---|---|---|---|
| 1 | `edit_code_hash` on `tenants` was readable by every member → offline brute-force of short codes | **High** | Moved to `tenant_secrets` (RLS, zero policies) |
| 2 | Admins could demote/disable the `owner` via `memberships_update` | **High** | Owner rows touchable only by owners |
| 3 | Client INSERT on `audit_log` allowed fabricated history entries | Medium | INSERT policy removed; definer-only writes |
| 4 | Unlimited 14-day trials per account | Medium | `created_by` + one-trial-per-account + 5-tenant cap |
| 5 | `verify_edit_code` brute-forceable via RPC | Medium | 5-fails/15-min lockout, counted from the immutable audit log |
| 6 | Slugs like `api`/`login`/`pos` collide with app routes | Medium | Reserved-slug blocklist in provisioning |
| 7 | Expired tenants could still UPDATE/DELETE (license gate only in `with check`) | Medium | Gate added to `using` — expired is truly read-only |
| 8 | `active` status never checked `current_period_end` | Medium | Checked; lapsed paid periods cut off exactly |
| 9 | No backups on Supabase free | **High (operational)** | Nightly `pg_dump` GitHub Action, 30-day artifacts |
| 10 | Redundant `memberships_tenant_idx`; missing cron + lockout indexes; per-row policy subquery on `profiles` | Low | Index tuning; `shares_tenant_with()` definer helper; column-level grants + anon default-privilege revoke as defense in depth |

Accepted trade-offs (deliberate, revisit at scale): path-based tenancy over subdomains; client-side exports; `past_due` treated as inactive until Phase 5 adds payment-grace handling; staff management still allowed on expired tenants (not business data).

## Phase roadmap (for context — each waits for approval)

1. **Phase 1 (this):** foundation — tenancy, auth, RLS, licensing/trial ✅
2. **Phase 2:** POS — menu/SKU-backed items, touch ordering, cart persistence, customer + source attribution, server-side price recompute, override-code edits, audit logging
3. **Phase 3:** KOT — kitchen display via Supabase Realtime, order status flow
4. **Phase 4:** Inventory + SKU management — stock, recipes/BOM, depletion on sale, low-stock alerts
5. **Phase 5:** Accounting + billing — day books, tax, P&L; Razorpay/Stripe subscription payments
6. **Phase 6:** Reports & exports everywhere (PDF/Excel), polish, onboarding, go-live checklist
