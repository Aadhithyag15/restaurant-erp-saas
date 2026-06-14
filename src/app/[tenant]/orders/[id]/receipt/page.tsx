import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PrintReceiptButton } from "@/components/orders/print-receipt-button";
import { formatMoney } from "@/lib/money";
import { sourceLabel } from "@/lib/orders";
import { createClient } from "@/lib/supabase/server";
import type { MemberRole } from "@/types/database";

export const metadata = { title: "Receipt" };

const ORDERS_ROLES: MemberRole[] = ["owner", "admin", "manager", "cashier"];

export default async function ReceiptPage({ params }: { params: Promise<{ tenant: string; id: string }> }) {
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
    .select("id, order_number, status, customer_name, customer_phone, source, outlet_id, subtotal, tax_total, total, created_at")
    .eq("id", id)
    .eq("tenant_id", tenant.id)
    .maybeSingle();
  if (!order) notFound();

  const [{ data: items }, { data: outlet }] = await Promise.all([
    supabase.from("order_items").select("id, name, qty, price, tax_rate, line_subtotal, line_tax").eq("order_id", order.id).order("created_at"),
    order.outlet_id ? supabase.from("outlets").select("name, address").eq("id", order.outlet_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  const placedAt = new Date(order.created_at).toLocaleString("en-IN", {
    timeZone: tenant.timezone,
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex w-full max-w-sm items-center justify-between print:hidden">
        <Link href={`/${slug}/orders/${order.id}`} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden />
          Back to order
        </Link>
        <PrintReceiptButton label={order.status === "served" ? "Reprint receipt" : "Print receipt"} />
      </div>

      <div className="w-full max-w-sm rounded-lg border bg-card p-6 font-mono text-sm text-card-foreground print:max-w-full print:border-0 print:p-0 print:shadow-none">
        <div className="text-center">
          <p className="text-base font-bold uppercase tracking-wide">{tenant.name}</p>
          {outlet?.address ? <p className="text-xs text-muted-foreground">{outlet.address}</p> : null}
        </div>

        <div className="my-3 border-t border-dashed" />

        <div className="flex flex-col gap-0.5 text-xs">
          <div className="flex justify-between">
            <span>Order #</span>
            <span>{order.order_number}</span>
          </div>
          <div className="flex justify-between">
            <span>Date</span>
            <span>{placedAt}</span>
          </div>
          {order.customer_name ? (
            <div className="flex justify-between">
              <span>Customer</span>
              <span>{order.customer_name}</span>
            </div>
          ) : null}
          {order.source !== "walk_in" ? (
            <div className="flex justify-between">
              <span>Source</span>
              <span>{sourceLabel(order.source)}</span>
            </div>
          ) : null}
        </div>

        <div className="my-3 border-t border-dashed" />

        <table className="w-full text-xs">
          <thead>
            <tr className="text-left">
              <th className="pb-1 font-normal">Item</th>
              <th className="pb-1 text-right font-normal">Qty</th>
              <th className="pb-1 text-right font-normal">Price</th>
              <th className="pb-1 text-right font-normal">Amount</th>
            </tr>
          </thead>
          <tbody>
            {(items ?? []).map((item) => (
              <tr key={item.id}>
                <td className="py-0.5 pr-2">{item.name}</td>
                <td className="py-0.5 text-right tabular-nums">{item.qty}</td>
                <td className="py-0.5 text-right tabular-nums">{formatMoney(item.price, tenant.currency)}</td>
                <td className="py-0.5 text-right tabular-nums">{formatMoney(item.line_subtotal + item.line_tax, tenant.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="my-3 border-t border-dashed" />

        <div className="flex flex-col gap-0.5 text-xs">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span className="tabular-nums">{formatMoney(order.subtotal, tenant.currency)}</span>
          </div>
          <div className="flex justify-between">
            <span>Tax</span>
            <span className="tabular-nums">{formatMoney(order.tax_total, tenant.currency)}</span>
          </div>
          <div className="my-1 border-t border-dashed" />
          <div className="flex justify-between text-sm font-bold">
            <span>Total</span>
            <span className="tabular-nums">{formatMoney(order.total, tenant.currency)}</span>
          </div>
        </div>

        <div className="my-3 border-t border-dashed" />

        <p className="text-center text-xs">Thank you, visit again!</p>
      </div>
    </div>
  );
}
