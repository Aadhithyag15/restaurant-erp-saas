import { notFound, redirect } from "next/navigation";
import { AlertTriangle, Boxes, IndianRupee, PackageSearch } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { IngredientManager } from "@/components/inventory/ingredient-manager";
import { InventorySettings } from "@/components/inventory/inventory-settings";
import { RecipeManager } from "@/components/inventory/recipe-manager";
import { TransactionList, type TransactionRow } from "@/components/inventory/transaction-list";
import { isLowStock, stockValue } from "@/lib/inventory";
import { formatMoney } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

export const metadata = { title: "Inventory" };

const RECENT_TRANSACTIONS_LIMIT = 25;

export default async function InventoryPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: slug } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: tenant } = await supabase.from("tenants").select("id, name, currency, settings").eq("slug", slug).maybeSingle();
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

  const [{ data: ingredients }, { data: menuItems }, { data: recipeLines }, { data: transactions }] = await Promise.all([
    supabase
      .from("ingredients")
      .select("id, name, unit, current_stock, minimum_stock, cost_per_unit")
      .eq("tenant_id", tenant.id)
      .order("name"),
    supabase.from("menu_items").select("id, name").eq("tenant_id", tenant.id).order("name"),
    supabase.from("menu_item_ingredients").select("id, menu_item_id, ingredient_id, quantity").eq("tenant_id", tenant.id),
    supabase
      .from("inventory_transactions")
      .select("id, type, quantity_change, resulting_stock, notes, created_at, ingredient:ingredients(name, unit)")
      .eq("tenant_id", tenant.id)
      .order("created_at", { ascending: false })
      .limit(RECENT_TRANSACTIONS_LIMIT),
  ]);

  const allIngredients = ingredients ?? [];
  const lowStockIngredients = allIngredients.filter(isLowStock);
  const totalValue = allIngredients.reduce((sum, i) => sum + stockValue(i), 0);

  const settings = (tenant.settings ?? {}) as Record<string, Json>;
  const inventorySettings = (settings.inventory ?? {}) as Record<string, Json>;
  const allowNegativeStock = inventorySettings.allow_negative_stock === true;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Inventory</h1>
        <p className="text-sm text-muted-foreground">Ingredients, recipes and stock movements. Placing a POS order depletes stock automatically.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ingredients</CardTitle>
            <Boxes className="size-4 text-muted-foreground" aria-hidden />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{allIngredients.length}</p>
            <p className="text-sm text-muted-foreground">tracked in stock</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Low stock</CardTitle>
            <AlertTriangle className="size-4 text-muted-foreground" aria-hidden />
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-semibold ${lowStockIngredients.length > 0 ? "text-destructive" : ""}`}>{lowStockIngredients.length}</p>
            <p className="text-sm text-muted-foreground">at or below minimum</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Stock value</CardTitle>
            <IndianRupee className="size-4 text-muted-foreground" aria-hidden />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{formatMoney(totalValue, tenant.currency)}</p>
            <p className="text-sm text-muted-foreground">current stock × cost</p>
          </CardContent>
        </Card>
      </div>

      {lowStockIngredients.length > 0 ? (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-destructive">
              <PackageSearch className="size-4" aria-hidden />
              Low stock alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-wrap gap-2">
              {lowStockIngredients.map((i) => (
                <li key={i.id} className="rounded-full border border-destructive/30 bg-background px-3 py-1 text-sm">
                  {i.name} — {i.current_stock} / {i.minimum_stock} {i.unit}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <IngredientManager tenantId={tenant.id} slug={slug} currency={tenant.currency} ingredients={allIngredients} />

      <RecipeManager tenantId={tenant.id} slug={slug} menuItems={menuItems ?? []} ingredients={allIngredients} recipeLines={recipeLines ?? []} />

      <TransactionList transactions={(transactions ?? []) as unknown as TransactionRow[]} />

      {membership.role === "owner" || membership.role === "admin" ? (
        <InventorySettings tenantId={tenant.id} slug={slug} allowNegativeStock={allowNegativeStock} />
      ) : null}
    </div>
  );
}
