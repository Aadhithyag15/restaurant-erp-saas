/**
 * Fails fast with an actionable message instead of an opaque Supabase error
 * when .env.local is missing. NEXT_PUBLIC_ values are inlined at build time.
 */
export function publicEnv(name: "NEXT_PUBLIC_SUPABASE_URL" | "NEXT_PUBLIC_SUPABASE_ANON_KEY"): string {
  const value =
    name === "NEXT_PUBLIC_SUPABASE_URL"
      ? process.env.NEXT_PUBLIC_SUPABASE_URL
      : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!value) {
    throw new Error(`Missing ${name} — copy .env.example to .env.local and fill in your Supabase keys.`);
  }
  return value;
}
