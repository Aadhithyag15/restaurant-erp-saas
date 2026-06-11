import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * PKCE code exchange — target of email confirmation, magic-link and
 * password-recovery links. Establishes the session cookie, then forwards
 * to the (sanitized, internal-only) `next` target.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const rawNext = searchParams.get("next") ?? "/go";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/go";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent("Sign-in link is invalid or expired.")}`);
}
