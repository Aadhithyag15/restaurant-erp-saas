import { notFound, redirect } from "next/navigation";
import { KitchenScreen, type KotOrder } from "@/components/kot/kitchen-screen";
import { createClient } from "@/lib/supabase/server";
import type { MemberRole } from "@/types/database";

export const metadata = { title: "Kitchen" };

const KOT_ROLES: MemberRole[] = ["owner", "admin", "manager", "kitchen"];
const OPEN_STATUSES = ["pending", "preparing", "ready"] as const;

/**
 * Kitchen Display (KOT). Server component fetches every open ticket
 * (pending/preparing/ready) plus its snapshot line items; the client screen
 * subscribes to Realtime for live updates and drives status transitions
 * through the update_order_status RPC.
 */
export default async function KotPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: slug } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: tenant } = await supabase.from("tenants").select("id, name").eq("slug", slug).maybeSingle();
  if (!tenant) notFound();

  const { data: membership } = await supabase
    .from("memberships")
    .select("role")
    .eq("tenant_id", tenant.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership || !KOT_ROLES.includes(membership.role)) {
    redirect(`/${slug}/dashboard`);
  }

  const { data: orders } = await supabase
    .from("orders")
    .select("id, order_number, status, customer_name, source, notes, created_at, status_updated_at")
    .eq("tenant_id", tenant.id)
    .in("status", OPEN_STATUSES)
    .order("created_at");

  const orderIds = (orders ?? []).map((o) => o.id);
  const { data: items } = orderIds.length
    ? await supabase.from("order_items").select("id, order_id, name, qty, is_veg").in("order_id", orderIds).order("created_at")
    : { data: [] as { id: string; order_id: string; name: string; qty: number; is_veg: boolean }[] };

  const itemsByOrder = new Map<string, KotOrder["items"]>();
  for (const item of items ?? []) {
    const list = itemsByOrder.get(item.order_id) ?? [];
    list.push({ id: item.id, name: item.name, qty: item.qty, isVeg: item.is_veg });
    itemsByOrder.set(item.order_id, list);
  }

  const kotOrders: KotOrder[] = (orders ?? []).map((o) => ({
    id: o.id,
    orderNumber: o.order_number,
    status: o.status,
    customerName: o.customer_name,
    source: o.source,
    notes: o.notes,
    createdAt: o.created_at,
    statusUpdatedAt: o.status_updated_at,
    items: itemsByOrder.get(o.id) ?? [],
  }));

  return <KitchenScreen tenantId={tenant.id} initialOrders={kotOrders} />;
}
