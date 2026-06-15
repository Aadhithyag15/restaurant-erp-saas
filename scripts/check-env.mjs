#!/usr/bin/env node
// Verifies the environment is ready for `next build` / `opennextjs-cloudflare build`.
// NEXT_PUBLIC_* values are inlined into the client bundle at build time, so a
// missing one here means a broken production build, not just a runtime error.
//
// Usage: node scripts/check-env.mjs

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

function loadDotEnv(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return out;
}

const dotEnv = { ...loadDotEnv(resolve(ROOT, ".env.local")), ...loadDotEnv(resolve(ROOT, ".env")) };
const env = { ...dotEnv, ...process.env };

const REQUIRED_BUILD_VARS = [
  {
    name: "NEXT_PUBLIC_SUPABASE_URL",
    hint: "Supabase project URL (Settings → API). Example: https://<ref>.supabase.co",
  },
  {
    name: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    hint: "Supabase anon/publishable key (Settings → API). Safe to expose — RLS is the guard.",
  },
  {
    name: "NEXT_PUBLIC_APP_URL",
    hint: "Public URL of this deployment, e.g. https://app.example.com or https://restaurant-erp.<account>.workers.dev",
  },
];

const RESERVED_RUNTIME_VARS = [
  {
    name: "SUPABASE_SERVICE_ROLE_KEY",
    hint: "Server-only. Not read by any code path yet — reserved for future privileged route handlers. Set via `wrangler secret put` if/when needed.",
  },
  {
    name: "CRON_SECRET",
    hint: "Server-only. Not read by any code path yet — reserved for future maintenance endpoints. Set via `wrangler secret put` if/when needed.",
  },
];

let missing = 0;

console.log("Checking build-time environment variables (.env.local / .env / shell env)...\n");

for (const { name, hint } of REQUIRED_BUILD_VARS) {
  if (env[name] && env[name].length > 0) {
    console.log(`  [ok]      ${name}`);
  } else {
    console.error(`  [MISSING] ${name} — ${hint}`);
    missing += 1;
  }
}

console.log("\nReserved (server-only, not yet used by the app — informational):\n");

for (const { name, hint } of RESERVED_RUNTIME_VARS) {
  const present = Boolean(env[name] && env[name].length > 0);
  console.log(`  [${present ? "set" : "unset"}]   ${name} — ${hint}`);
}

if (missing > 0) {
  console.error(`\n${missing} required build variable(s) missing. Copy .env.example to .env.local and fill them in.`);
  process.exit(1);
}

console.log("\nAll required build-time environment variables are present.");
