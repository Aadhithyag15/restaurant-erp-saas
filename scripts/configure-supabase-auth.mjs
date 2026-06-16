#!/usr/bin/env node
// One-time production hardening for Supabase Auth: points the project at the
// deployed app URL and switches outbound auth email (confirmations, password
// resets, invites) from Supabase's shared (rate-limited, no-SMTP) sender to
// Resend.
//
// Prints the planned change and exits without writing anything, unless
// --apply is passed — review the diff first.
//
// Required env vars:
//   SUPABASE_ACCESS_TOKEN   Personal access token: supabase.com/dashboard/account/tokens
//   SUPABASE_PROJECT_REF    Project ref (the <ref> in https://<ref>.supabase.co)
//   SITE_URL                Production URL, e.g. https://app.example.com
//                           or https://restaurant-erp.<account>.workers.dev
//   RESEND_API_KEY          From resend.com → API Keys (used as the SMTP password)
//   RESEND_SENDER_EMAIL     Verified sender, e.g. noreply@example.com
//                           (the domain must be verified in Resend → Domains)
//
// Optional env vars:
//   RESEND_SENDER_NAME      Defaults to "Restaurant Flow"
//   EXTRA_REDIRECT_URLS     Comma-separated extra redirect URLs to allow,
//                           in addition to "<SITE_URL>/auth/callback" and
//                           "<SITE_URL>/**"
//   ENABLE_EMAIL_CONFIRMATION  "true" to require confirmed emails before
//                           sign-in (recommended once SMTP works). Defaults
//                           to "true". Set "false" to keep the dev-mode
//                           auto-confirm behaviour.
//
// Usage:
//   node scripts/configure-supabase-auth.mjs            # dry run (prints diff)
//   node scripts/configure-supabase-auth.mjs --apply     # applies via Management API

const required = ["SUPABASE_ACCESS_TOKEN", "SUPABASE_PROJECT_REF", "SITE_URL", "RESEND_API_KEY", "RESEND_SENDER_EMAIL"];
const missing = required.filter((name) => !process.env[name]);
if (missing.length > 0) {
  console.error(`Missing required env var(s): ${missing.join(", ")}\n`);
  console.error("See the header of scripts/configure-supabase-auth.mjs for what each one is and where to find it.");
  process.exit(1);
}

const {
  SUPABASE_ACCESS_TOKEN,
  SUPABASE_PROJECT_REF,
  SITE_URL,
  RESEND_API_KEY,
  RESEND_SENDER_EMAIL,
  RESEND_SENDER_NAME = "Restaurant Flow",
  EXTRA_REDIRECT_URLS = "",
  ENABLE_EMAIL_CONFIRMATION = "true",
} = process.env;

const siteUrl = SITE_URL.replace(/\/+$/, "");

const redirectUrls = [
  `${siteUrl}/auth/callback`,
  `${siteUrl}/**`,
  ...EXTRA_REDIRECT_URLS.split(",").map((s) => s.trim()).filter(Boolean),
];

const payload = {
  site_url: siteUrl,
  uri_allow_list: redirectUrls.join(","),
  // Resend SMTP — see https://resend.com/docs/send-with-smtp
  smtp_host: "smtp.resend.com",
  smtp_port: 465,
  smtp_user: "resend",
  smtp_pass: RESEND_API_KEY,
  smtp_sender_name: RESEND_SENDER_NAME,
  smtp_admin_email: RESEND_SENDER_EMAIL,
  // With real SMTP in place, require confirmed emails before sign-in.
  mailer_autoconfirm: ENABLE_EMAIL_CONFIRMATION !== "true" ? true : false,
  // Shared-sender default of 2/hour is far too low for real signups; Resend's
  // free tier supports 100/day — 30/hour leaves headroom under that.
  rate_limit_email_sent: 30,
};

console.log("Planned Supabase Auth config update:\n");
for (const [key, value] of Object.entries(payload)) {
  const printed = key === "smtp_pass" ? `${String(value).slice(0, 6)}…(hidden)` : value;
  console.log(`  ${key}: ${JSON.stringify(printed)}`);
}

const apply = process.argv.includes("--apply");
if (!apply) {
  console.log("\nDry run only — re-run with --apply to PATCH the live project.");
  process.exit(0);
}

const url = `https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/config/auth`;
const res = await fetch(url, {
  method: "PATCH",
  headers: {
    Authorization: `Bearer ${SUPABASE_ACCESS_TOKEN}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(payload),
});

if (!res.ok) {
  console.error(`\nManagement API error ${res.status}: ${await res.text()}`);
  process.exit(1);
}

console.log("\nApplied. Verify in Supabase Dashboard → Authentication → URL Configuration / SMTP Settings.");
console.log("Send a test signup/reset email to confirm Resend delivery before relying on it.");
