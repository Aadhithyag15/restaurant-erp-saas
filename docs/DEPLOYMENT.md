# Deployment Guide — Production

> Status: the app is feature-complete (Phases 1–6). This document covers
> taking it from local development to a production deployment on
> **Cloudflare Workers** (primary path, already wired up via
> `@opennextjs/cloudflare`), plus the Supabase production configuration
> (URLs, SMTP via Resend, email confirmation) that must be done alongside it.

---

## 1. Architecture recap

```
Browser ──HTTPS──> Cloudflare Worker (Next.js via OpenNext)
                       │  - SSR pages, server actions, route handlers
                       │  - anon key + RLS for all data access
                       ▼
                   Supabase (Postgres + Auth)
                       │  - RLS enforces tenancy/roles/license
                       ▼
                   Resend (SMTP) — auth emails only
```

- The Worker is stateless; all persistent state is in Supabase Postgres.
- `NEXT_PUBLIC_*` env vars are **inlined at build time** into the client
  bundle — they must be present when `opennextjs-cloudflare build` runs, not
  just at runtime.
- `SUPABASE_SERVICE_ROLE_KEY` and `CRON_SECRET` are reserved for future
  server-only use; no current code path reads them. If/when a route handler
  needs the service-role key, set it with `wrangler secret put` — never as a
  `NEXT_PUBLIC_*` var and never committed.

---

## 2. Production deployment checklist

Work through this top to bottom for a first production deploy.

- [ ] **Code is green**: `npm run verify` (lint + typecheck + test + build)
      passes locally and in CI.
- [ ] **Supabase migrations applied**: every file in `supabase/migrations/`
      has been run against the production project, in order.
- [ ] **`src/types/database.ts` matches the live schema** (the
      `check-db-types` workflow is green).
- [ ] **Supabase Auth → URL Configuration** updated for the production
      domain (Section 4.1).
- [ ] **SMTP configured via Resend** and a test email delivered (Section 4.2).
- [ ] **Email confirmation re-enabled** (`mailer_autoconfirm = false`) now
      that SMTP works (Section 4.2 — this was temporarily disabled in dev
      because no SMTP was configured).
- [ ] **Cloudflare Worker deployed** (Section 5) and reachable.
- [ ] **`NEXT_PUBLIC_APP_URL` set to the production URL** and the app
      rebuilt/redeployed with it (it's inlined at build time).
- [ ] **Post-deploy smoke test** completed (Section 7): signup, email
      confirmation, login, tenant dashboard, POS order, Reports/Accounting
      pages.
- [ ] **DB backup workflow verified** (`db-backup.yml` — see README; required
      since Supabase free has no automatic backups).
- [ ] **Repo is private** (the backup workflow dumps customer data into
      artifacts).

---

## 3. Environment variables

### 3.1 Required at build time (inlined into the client bundle)

| Variable | Where it's used | Production value |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | [src/lib/env.ts](../src/lib/env.ts), all Supabase clients | `https://<project-ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | same | Anon/publishable key — Supabase → Settings → API. Safe to expose; RLS is the guard. |
| `NEXT_PUBLIC_APP_URL` | [src/lib/site.ts](../src/lib/site.ts) — builds absolute URLs for auth email redirects (`emailRedirectTo`, password reset links) | Deployed URL, e.g. `https://restaurant-erp.<account>.workers.dev` or a custom domain |

Run `npm run check:env` (also runs automatically before `npm run deploy` /
`npm run preview`) to verify these are set in `.env.local` / `.env` / the
shell before building.

In **CI**, set these as repo **Variables** (Settings → Secrets and variables
→ Actions → Variables) — `.github/workflows/ci.yml` reads them with safe
placeholder fallbacks so forks/PRs from contributors without access still
build.

In the **Cloudflare dashboard**, build-time vars come from whatever
environment runs `opennextjs-cloudflare build` (your local `.env.local`, or a
CI job's env) — Cloudflare Pages/Workers Builds env vars also work if you
wire up Git-connected builds.

### 3.2 Reserved (server-only, not currently read by any code)

| Variable | Purpose | How to set in production |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Future privileged route handlers (tenant provisioning edge cases, billing webhooks). **Never** `NEXT_PUBLIC_*`. | `npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY` |
| `CRON_SECRET` | Future app-side maintenance endpoints. Generate with `openssl rand -hex 16`. | `npx wrangler secret put CRON_SECRET` |

Neither is needed for the current feature set — don't set them until a code
path actually reads them (`grep -r "process.env.SUPABASE_SERVICE_ROLE_KEY\|process.env.CRON_SECRET" src` confirms whether that's still true).

### 3.3 Used only by deployment scripts (never read by the app)

| Variable | Purpose |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | Personal access token for the Supabase Management API — [scripts/configure-supabase-auth.mjs](../scripts/configure-supabase-auth.mjs) |
| `SUPABASE_PROJECT_REF` | Project ref, same script |
| `SITE_URL` | Production app URL, same script |
| `RESEND_API_KEY`, `RESEND_SENDER_EMAIL`, `RESEND_SENDER_NAME` | Resend SMTP credentials, same script |

### 3.4 Unused placeholders

`RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` / `RAZORPAY_WEBHOOK_SECRET` are
documented in `.env.example` for a future payments phase. Nothing reads them
yet — do not set them.

---

## 4. Supabase production configuration

### 4.1 URL configuration

Once you know the production URL (Cloudflare gives you a `*.workers.dev` URL
on first deploy, or use your custom domain from the start):

1. Supabase Dashboard → **Authentication → URL Configuration**:
   - **Site URL**: `https://<your-production-url>`
   - **Redirect URLs**: add `https://<your-production-url>/auth/callback`
     and `https://<your-production-url>/**`
   - Keep `http://localhost:3000/**` too if you still develop locally
     against this project.
2. Set `NEXT_PUBLIC_APP_URL` to the same production URL and redeploy (it's
   inlined at build time — see [src/lib/site.ts](../src/lib/site.ts)).

`scripts/configure-supabase-auth.mjs` (below) sets the Site URL and redirect
URLs for you as part of the SMTP setup.

### 4.2 SMTP via Resend

Supabase's built-in email sender is rate-limited (2/hour) and not suitable
for production — every signup, password reset, and staff invite sends an
email. This project's dev environment had `mailer_autoconfirm` temporarily
**enabled** (skips email confirmation) for exactly this reason. For
production, configure Resend SMTP and **re-enable email confirmation**.

**One-time setup:**

1. Create a Resend account at [resend.com](https://resend.com) and verify a
   sending domain (Domains → Add Domain → add the DNS records they give you).
2. Create an API key (API Keys → Create API Key). This doubles as the SMTP
   password.
3. Run the configuration script (dry run first — it prints the diff without
   changing anything):

   ```bash
   export SUPABASE_ACCESS_TOKEN=<personal access token from supabase.com/dashboard/account/tokens>
   export SUPABASE_PROJECT_REF=<project-ref>
   export SITE_URL=https://<your-production-url>
   export RESEND_API_KEY=<resend API key>
   export RESEND_SENDER_EMAIL=noreply@<your-verified-domain>
   export RESEND_SENDER_NAME="Restaurant Flow"   # optional, this is the default

   node scripts/configure-supabase-auth.mjs            # dry run — review the diff
   node scripts/configure-supabase-auth.mjs --apply    # applies via Management API
   ```

   This sets, in one PATCH to `/v1/projects/<ref>/config/auth`:
   - `site_url` and `uri_allow_list` → your production URL + `/auth/callback` + `/**`
   - `smtp_host=smtp.resend.com`, `smtp_port=465`, `smtp_user=resend`,
     `smtp_pass=<RESEND_API_KEY>`, `smtp_sender_name`, `smtp_admin_email`
   - `mailer_autoconfirm=false` (re-enables email confirmation — pass
     `ENABLE_EMAIL_CONFIRMATION=false` to keep it disabled instead)
   - `rate_limit_email_sent=30` (Resend's free tier allows 100/day; 30/hour
     leaves headroom)

4. **Verify delivery**: sign up with a real email address against the
   production project and confirm the confirmation email arrives via Resend
   (check Resend → Logs for the send). Supabase Dashboard → Authentication →
   Rate Limits and → SMTP Settings should both reflect the new values.

If signups stop working after this change (e.g. confirmation emails not
arriving), `mailer_autoconfirm` can be temporarily set back to `true` via the
same script (`ENABLE_EMAIL_CONFIRMATION=false --apply`) while you debug Resend
— this is exactly the failure mode fixed in
[docs/PHASE_6_COMPLETE.md](PHASE_6_COMPLETE.md).

### 4.3 RLS and backups

No changes needed for deployment — RLS policies are part of the migrations
and apply identically in production. Confirm:

- `.github/workflows/db-backup.yml` is enabled and has run at least once
  (repo secret `SUPABASE_DB_URL`, **session pooler** connection string). See
  the comments in that file and the README's "Backups" section.
- `.github/workflows/check-db-types.yml` is green (repo secrets
  `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_ID`).

---

## 5. Cloudflare Workers deployment (primary)

Cloudflare's free Workers plan permits commercial use (Vercel's Hobby tier
does not), so this is the default target. Deployment is via
`@opennextjs/cloudflare`, already configured in
[wrangler.jsonc](../wrangler.jsonc) and [open-next.config.ts](../open-next.config.ts).

### 5.1 First-time setup

```bash
npx wrangler login
```

Build-time public vars (`NEXT_PUBLIC_*`) come from `.env.local` (or your
shell/CI env) — set them per Section 3.1 before building.

### 5.2 Build, preview, deploy

```bash
npm run check:env   # verify required NEXT_PUBLIC_* vars are present

npm run preview     # opennextjs-cloudflare build + run the production
                     # worker locally (closest thing to prod, on your machine)

npm run deploy      # opennextjs-cloudflare build + deploy to
                     # *.workers.dev (or your custom domain)
```

`npm run deploy` runs `predeploy` first (`check:env` + `verify`: lint,
typecheck, test, build) — a broken build or failing test blocks the deploy.

First deploy gives you a `https://restaurant-erp.<account>.workers.dev` URL.
Use that URL for Section 4.1 (Supabase URL config) and
`NEXT_PUBLIC_APP_URL`, then redeploy so the new `NEXT_PUBLIC_APP_URL` is
inlined.

### 5.3 Custom domain

Cloudflare Dashboard → Workers & Pages → `restaurant-erp` → Settings →
Domains & Routes → Add a custom domain (free, automatic TLS). After adding
it:

1. Update `NEXT_PUBLIC_APP_URL` to the custom domain and redeploy.
2. Update Supabase Auth → URL Configuration (Section 4.1) to the custom
   domain (or re-run `scripts/configure-supabase-auth.mjs` with the new
   `SITE_URL`).

### 5.4 Secrets

`SUPABASE_SERVICE_ROLE_KEY` / `CRON_SECRET` are not currently used (Section
3.2). If a future change needs them at runtime:

```bash
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put CRON_SECRET
```

These are encrypted at rest by Cloudflare and never appear in
`wrangler.jsonc` or git.

### 5.5 Observability

`wrangler.jsonc` has `observability.enabled: true` — Cloudflare Dashboard →
Workers & Pages → `restaurant-erp` → Logs shows live request logs and any
`console.error` output (e.g. the middleware's Supabase timeout logging in
[src/lib/supabase/middleware.ts](../src/lib/supabase/middleware.ts)).

---

## 6. Alternative: Vercel

If Cloudflare isn't an option, the app is a standard Next.js 15 App Router
project and deploys to Vercel with no changes:

```bash
npx vercel
```

Set the same `NEXT_PUBLIC_*` variables in Vercel Project Settings →
Environment Variables (build-time + runtime — Vercel applies them to both).
Everything in Section 4 (Supabase URL config, Resend SMTP) is identical;
`SITE_URL` becomes your `*.vercel.app` URL or custom domain.

**Caveat**: Vercel's Hobby (free) tier prohibits commercial use — a paid
plan is required for a paying-customer SaaS. This is why Cloudflare Workers
is the primary recommendation (see
[docs/phase1-architecture.md](phase1-architecture.md)).

---

## 7. Post-deploy smoke test

Run through this against the production URL after every deploy that touches
auth, routing, or the database:

1. **Signup**: create a new account with a real email. If email confirmation
   is enabled (Section 4.2), confirm via the emailed link — should land on
   `/onboarding`.
2. **Onboarding**: create a tenant — should land on `/{slug}/dashboard` with
   the 14-day trial banner.
3. **Sign out / sign in**: confirm both work and return to the tenant
   dashboard.
4. **POS → KOT**: place an order in POS, confirm it appears in KOT and the
   status flow works.
5. **Reports / Accounting**: `/{slug}/reports` and `/{slug}/accounting`
   render without errors (empty states are fine for a fresh tenant); record
   a daily closing and confirm it saves.
6. **Staff invite**: send an invite, confirm the invite email is delivered
   (Resend) and `/invite/[token]` works for a new user.
7. **Password reset**: `/forgot-password` → email delivered → reset link
   works.

---

## 8. Rollback

Cloudflare Workers keeps previous deployments:

```bash
npx wrangler deployments list
npx wrangler rollback [deployment-id]
```

Database migrations are forward-only by convention (no down-migrations in
`supabase/migrations/`) — if a deploy paired with a migration needs
rolling back, restore from the nightly `db-backup.yml` artifact rather than
attempting to reverse the migration.

---

## 9. Ongoing maintenance

- **`npm run verify`** before every deploy (also enforced by `predeploy`).
- **CI** (`.github/workflows/ci.yml`) runs the same checks on every push/PR.
- **`check-db-types.yml`** catches schema/type drift weekly and on migration
  PRs.
- **`db-backup.yml`** dumps the database nightly — also keeps the free
  Supabase project from auto-pausing after 7 idle days.
- After every new migration: regenerate types with
  `npx supabase gen types typescript --project-id <ref> --schema public > src/types/database.ts`.
