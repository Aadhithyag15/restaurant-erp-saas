import { notFound, redirect } from "next/navigation";
import { CategoryManager } from "@/components/menu/category-manager";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Menu manager" };

/** Menu manager — categories (M2); items join below in M3. Managing roles only. */
export default async function MenuPage({ params }: { params: Promise<{ tenant: string }> }) {
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
  if (!membership || !["owner", "admin", "manager"].includes(membership.role)) {
    redirect(`/${slug}/dashboard`);
  }

  const { data: categories } = await supabase
    .from("menu_categories")
    .select("id, name, sort_order, is_active")
    .eq("tenant_id", tenant.id)
    .order("sort_order")
    .order("name");

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Menu manager</h1>
        <p className="text-sm text-muted-foreground">
          Categories and items shown on the POS. Every change is recorded in the audit history.
        </p>
      </div>

      <CategoryManager tenantId={tenant.id} slug={slug} categories={categories ?? []} />
    </div>
  );
}
