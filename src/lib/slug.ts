/** Must stay in sync with the checks in supabase/migrations/0001_foundation.sql. */
export const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;

export const RESERVED_SLUGS = [
  "api", "app", "auth", "admin", "account", "assets", "billing", "dashboard",
  "docs", "help", "invite", "inventory", "kitchen", "kot", "login", "logout",
  "new", "onboarding", "pos", "pricing", "public", "reports", "settings",
  "signin", "signout", "signup", "static", "status", "support", "www",
  "accounting", "go", "reset-password", "forgot-password",
] as const;

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

/** Returns an error message, or null when the slug is acceptable. */
export function validateSlug(slug: string): string | null {
  if (!SLUG_REGEX.test(slug)) {
    return "Use 3–40 lowercase letters, numbers and hyphens (no leading/trailing hyphen).";
  }
  if ((RESERVED_SLUGS as readonly string[]).includes(slug)) {
    return "This address is reserved — please choose another.";
  }
  return null;
}
