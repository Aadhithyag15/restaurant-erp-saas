"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { validateSlug } from "@/lib/slug";

export type ActionState = { error: string } | null;

const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED", "SGD", "AUD", "CAD"];

/**
 * Provisions the restaurant atomically via the create_tenant_with_trial RPC
 * (tenant + outlet + owner membership + 14-day trialing subscription, plus all
 * abuse guards) — the app never assembles a tenant from parts.
 */
export async function createTenant(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const name = String(formData.get("name") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim().toLowerCase();
  const currency = String(formData.get("currency") ?? "INR");

  if (name.length < 2) return { error: "Enter your restaurant's name." };
  const slugError = validateSlug(slug);
  if (slugError) return { error: slugError };
  if (!CURRENCIES.includes(currency)) return { error: "Choose a supported currency." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_tenant_with_trial", { p_name: name, p_slug: slug });
  if (error) {
    // RPC raise messages are user-facing by design (slug taken, trial guard…)
    return { error: error.message };
  }

  if (currency !== "INR") {
    // Column-scoped grant: clients may update currency, never slug/created_by.
    await supabase.from("tenants").update({ currency }).eq("slug", slug);
  }

  revalidatePath("/", "layout");
  redirect(`/${slug}/dashboard`);
}

export async function updateTenantName(tenantId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2) return { error: "Name must be at least 2 characters." };

  const supabase = await createClient();
  const { error } = await supabase.from("tenants").update({ name }).eq("id", tenantId);
  if (error) return { error: "Could not save — only owners and admins can rename." };

  revalidatePath("/", "layout");
  return null;
}
