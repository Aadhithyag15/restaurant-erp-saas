import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import { OrderStatusTimeline } from "@/components/orders/order-status-timeline";
import { StatusBadge } from "@/components/orders/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { VegMark } from "@/components/menu/veg-mark";
import { formatMoney } from "@/lib/money";
import { sourceLabel } from "@/lib/orders";
import { createClient } from "@/lib/supabase/server";
import type { MemberRole } from "@/types/database";

export const metadata = { title: "Order details" };

const ORDERS_ROLES: MemberRole[] = ["owner", "admin", "manager", "cashier"];

export default async function OrderDetailsPage({ params }: { params: Promise<{ tenant: string; id: string }> }) {
  const { tenant: slug, id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: tenant } = await supabase.from("tenants").select("id, name, currency, timezone").eq("slug", slug).maybeSingle();
  if (!tenant) notFound();

  const { data: membership } = await supabase
    .from("memberships")
    .select("role")
    .eq("tenant_id", tenant.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership || !ORDERS_ROLES.includes(membership.role)) {
    redirect(`/${slug}/dashboard`);
  }

  const { data: order } = await supabase
    .from("orders")
    .select(
      "id, order_number, status, customer_name, customer_phone, source, notes, subtotal, tax_total, total, placed_by, created_at, status_updated_at",
    )
    .eq("id", id)
    .eq("tenant_id", tenant.id)
    .maybeSingle();
  if (!order) notFound();

  const [{ data: items }, { data: placedByProfile }] = await Promise.all([
    supabase
      .from("order_items")
      .select("id, name, sku, is_veg, price, tax_rate, qty, line_subtotal, line_tax")
      .eq("order_id", order.id)
      .order("created_at"),
    order.placed_by
      ? supabase.from("profiles").select("full_name, email").eq("id", order.placed_by).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const placedByName = placedByProfile?.full_name || placedByProfile?.email || null;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href={`/${slug}/orders`} className="mb-1 flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground">
            <ArrowLeft className="size-4" aria-hidden />
            Orders
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">Order #{order.order_number}</h1>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={order.status} className="text-sm" />
          <Button asChild variant="outline" size="sm">
            <Link href={`/${slug}/orders/${order.id}/receipt`}>
              <Printer aria-hidden />
              {order.status === "served" ? "Reprint receipt" : "Print receipt"}
            </Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Status</CardTitle>
        </CardHeader>
        <CardContent>
          <OrderStatusTimeline status={order.status} createdAt={order.created_at} statusUpdatedAt={order.status_updated_at} timeZone={tenant.timezone} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Order information</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Placed</dt>
              <dd className="text-sm">
                {new Date(order.created_at).toLocaleString("en-IN", { timeZone: tenant.timezone, dateStyle: "medium", timeStyle: "short" })}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Source</dt>
              <dd className="text-sm">{sourceLabel(order.source)}</dd>
            </div>
            {order.customer_name ? (
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">Customer</dt>
                <dd className="text-sm">{order.customer_name}</dd>
              </div>
            ) : null}
            {order.customer_phone ? (
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">Phone</dt>
                <dd className="text-sm">{order.customer_phone}</dd>
              </div>
            ) : null}
            {placedByName ? (
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">Placed by</dt>
                <dd className="text-sm">{placedByName}</dd>
              </div>
            ) : null}
            {order.notes ? (
              <div className="sm:col-span-2">
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">Notes</dt>
                <dd className="text-sm">{order.notes}</dd>
              </div>
            ) : null}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Items</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ul className="divide-y">
            {(items ?? []).map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 px-6 py-3">
                <div className="flex min-w-0 items-start gap-2">
                  <VegMark isVeg={item.is_veg} className="mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {item.qty}× {item.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatMoney(item.price, tenant.currency)} each · {item.tax_rate}% tax
                    </p>
                  </div>
                </div>
                <span className="shrink-0 text-sm font-medium tabular-nums">{formatMoney(item.line_subtotal + item.line_tax, tenant.currency)}</span>
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-1 border-t px-6 py-4 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="tabular-nums">{formatMoney(order.subtotal, tenant.currency)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tax</span>
              <span className="tabular-nums">{formatMoney(order.tax_total, tenant.currency)}</span>
            </div>
            <div className="flex justify-between text-base font-semibold">
              <span>Total</span>
              <span className="tabular-nums">{formatMoney(order.total, tenant.currency)}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
