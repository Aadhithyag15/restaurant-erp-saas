import { notFound, redirect } from "next/navigation";
import { PosScreen } from "@/components/pos/pos-screen";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "POS" };

/**
 * POS ordering screen. Server component fetches the live menu (RLS-scoped);
 * the client screen handles filtering, search and the cart. Prices shown are
 * display-only — order pricing is recomputed server-side in the KOT phase.
 */
export default async function PosPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: slug } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: tenant } = await supabase.from("tenants").select("id, name, currency").eq("slug", slug).maybeSingle();
  if (!tenant) notFound();

  const { data: membership } = await supabase
    .from("memberships")
    .select("role")
    .eq("tenant_id", tenant.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (membership?.role === "kitchen") redirect(`/${slug}/dashboard`);

  const [{ data: categories }, { data: items }] = await Promise.all([
    supabase
      .from("menu_categories")
      .select("id, name")
      .eq("tenant_id", tenant.id)
      .eq("is_active", true)
      .order("sort_order")
      .order("name"),
    supabase
      .from("menu_items")
      .select("id, category_id, name, sku, price, tax_rate, is_veg, description")
      .eq("tenant_id", tenant.id)
      .eq("is_available", true)
      .order("name"),
  ]);

  return <PosScreen slug={slug} currency={tenant.currency} categories={categories ?? []} items={items ?? []} />;
}
