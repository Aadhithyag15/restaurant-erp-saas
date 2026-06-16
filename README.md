# Restaurant Flow

Multi-tenant restaurant management SaaS — POS, KOT, inventory, SKUs and accounting, licensed with a
14-day free trial. Next.js 15 + Supabase, deployed on Cloudflare's free tier.

- Architecture & phase plan: [docs/phase1-architecture.md](docs/phase1-architecture.md)
- Database schema + RLS: [supabase/migrations/0001_foundation.sql](supabase/migrations/0001_foundation.sql)

## Local development

1. **Supabase** — create a free project at supabase.com, open the SQL editor and run
   `supabase/migrations/0001_foundation.sql`. Enable the Email auth provider (keep
   "Confirm email" on) and add `http://localhost:3000` to Auth → URL Configuration →
   Redirect URLs.
2. **Env** — copy `.env.example` to `.env.local`, fill in the URL and anon key from
   Supabase → Settings → API.
3. **Run**
   ```bash
   npm install
   npm run dev        # http://localhost:3000
   npm test           # vitest unit tests
   npm run typecheck  # strict TS, no emit
   ```

## Deployment (Cloudflare, free tier)

The app deploys to **Cloudflare Workers via `@opennextjs/cloudflare`** — Cloudflare's
recommended path for Next.js (the older `next-on-pages`/Pages route is in maintenance mode).
The free Workers plan permits commercial use, unlike Vercel's Hobby tier.

```bash
npx wrangler login

# Build-time public vars are inlined from the environment:
#   NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / NEXT_PUBLIC_APP_URL
# (set them in .env.local locally, or in CI variables)

npm run preview   # build + run the production worker locally
npm run deploy    # build + deploy to *.workers.dev (or your domain)
```

After the first deploy:

1. Add the deployed URL to Supabase Auth → URL Configuration (Site URL + Redirect URLs,
   including `/auth/callback`).
2. Set `NEXT_PUBLIC_APP_URL` to the deployed URL and redeploy.
3. Attach a custom domain in the Cloudflare dashboard when ready (free).

## Backups (required — free Supabase has none)

`.github/workflows/db-backup.yml` dumps the database nightly to a 30-day GitHub artifact.
Add the **session-pooler** connection string as the `SUPABASE_DB_URL` repo secret (repo must
be private) and run the workflow once manually to verify.

## Testing

Unit tests live next to their modules (`src/**/*.test.ts`, Vitest, node environment) and
cover the pure logic the UI trusts: license derivation and slug validation. Component and
end-to-end tests are added per feature phase (POS gets them first — that's where behaviour
gets interesting).

## Project conventions

- **Security lives in Postgres.** RLS + definer RPCs are the boundary; the app is a thin,
  honest client. Never add a service-role call where an RLS path exists.
- **No emojis in product UI; SVG icons only** (lucide-react).
- Every tenant-scoped table/query carries `tenant_id`; URLs are `/{tenant-slug}/…`.
- After every migration: regenerate `src/types/database.ts`
  (`npx supabase gen types typescript --project-id <ref>`).
