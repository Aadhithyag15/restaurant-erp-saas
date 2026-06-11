"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Auth server actions. Errors surface via redirect + searchParams so the
 * pages stay server components (zero client JS, progressive enhancement).
 * Failure messages are intentionally generic — no account enumeration.
 */

async function siteOrigin(): Promise<string> {
  const h = await headers();
  return process.env.NEXT_PUBLIC_APP_URL ?? h.get("origin") ?? "http://localhost:3000";
}

function back(path: string, params: Record<string, string>): never {
  const qs = new URLSearchParams(params).toString();
  redirect(`${path}?${qs}`);
}

/** Only allow internal redirect targets — never user-supplied absolute URLs. */
function safeNext(next: unknown): string | null {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : null;
}

export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = safeNext(formData.get("next"));

  if (!email || !password) back("/login", { error: "Enter your email and password." });

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) back("/login", { error: "Invalid email or password." });

  revalidatePath("/", "layout");
  redirect(next ?? "/go");
}

export async function signup(formData: FormData) {
  const fullName = String(formData.get("full_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!fullName) back("/signup", { error: "Enter your name." });
  if (!email) back("/signup", { error: "Enter your email." });
  if (password.length < 8) back("/signup", { error: "Password must be at least 8 characters." });

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
      emailRedirectTo: `${await siteOrigin()}/auth/callback?next=/go`,
    },
  });
  if (error) back("/signup", { error: "Could not create the account. Try again or use a different email." });

  back("/login", { message: "Check your email to confirm your account, then sign in." });
}

export async function forgotPassword(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) back("/forgot-password", { error: "Enter your email." });

  const supabase = await createClient();
  // Always report success — never reveal whether the email exists.
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${await siteOrigin()}/auth/callback?next=/reset-password`,
  });
  back("/forgot-password", { message: "If that email has an account, a reset link is on its way." });
}

export async function resetPassword(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  if (password.length < 8) back("/reset-password", { error: "Password must be at least 8 characters." });

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) back("/reset-password", { error: "Could not update the password. Open the email link again." });

  revalidatePath("/", "layout");
  redirect("/go");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
