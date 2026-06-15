import { notFound, redirect } from "next/navigation";
import { CalendarRange, ListOrdered, ReceiptText } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FadeIn } from "@/components/motion/fade-in";
import { StatCard } from "@/components/dashboard/stat-card";
import { RevenueTrendChart } from "@/components/dashboard/revenue-trend-chart";
import { ExportButtons } from "@/components/reports/export-buttons";
import { PaymentMethodBreakdown } from "@/components/reports/payment-method-breakdown";
import { ReportsFilterBar } from "@/components/reports/reports-filter-bar";
import { StatusBadge } from "@/components/orders/status-badge";
import { formatMoney } from "@/lib/money";
import { parseStatusFilter } from "@/lib/orders";
import {
  aggregateCategoryPerformance,
  aggregatePaymentMethods,
  aggregateRevenueByDay,
  aggregateTopItems,
  averageOrderValue,
  buildSalesReportRows,
  parsePaymentMethodFilter,
  parseReportDateParam,
  resolveReportRange,
  sumTotal,
  type ReportOrderItemRow,
  type ReportOrderRow,
} from "@/lib/reports";
import { createClient } from "@/lib/supabase/server";
import { localDayRangeUtc, todayInTimeZone } from "@/lib/timezone";
import type { MemberRole } from "@/types/database";

export const metadata = { title: "Reports" };

const REPORTS_ROLES: MemberRole[] = ["owner", "admin", "manager"];

type SearchParams = Record<string, string | string[] | undefined>;

export default async function ReportsPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { tenant: slug } = await params;
  const sp = await searchParams;
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
  if (!membership || !REPORTS_ROLES.includes(membership.role)) {
    redirect(`/${slug}/dashboard`);
  }

  const today = todayInTimeZone(tenant.timezone);
  const { from, to } = resolveReportRange(parseReportDateParam(sp.from), parseReportDateParam(sp.to), today);
  const status = parseStatusFilter(sp.status);
  const payment = parsePaymentMethodFilter(sp.payment);

  const { start: rangeStart } = localDayRangeUtc(from, tenant.timezone);
  const { end: rangeEnd } = localDayRangeUtc(to, tenant.timezone);

  let ordersQuery = supabase
    .from("orders")
    .select("id, order_number, status, payment_method, customer_name, subtotal, tax_total, total, created_at")
    .eq("tenant_id", tenant.id)
    .gte("created_at", rangeStart)
    .lt("created_at", rangeEnd);
  if (status) ordersQuery = ordersQuery.eq("status", status);
  if (payment) ordersQuery = ordersQuery.eq("payment_method", payment);

  const [{ data: orders }, { data: orderItemsRaw }, { data: menuItems }, { data: categories }] = await Promise.all([
    ordersQuery.order("created_at", { ascending: false }),
    supabase
      .from("order_items")
      .select("order_id, item_id, name, qty, line_subtotal, line_tax")
      .eq("tenant_id", tenant.id)
      .gte("created_at", rangeStart)
      .lt("created_at", rangeEnd),
    supabase.from("menu_items").select("id, category_id").eq("tenant_id", tenant.id),
    supabase.from("menu_categories").select("id, name").eq("tenant_id", tenant.id),
  ]);

  const filteredOrders = (orders ?? []) as ReportOrderRow[];
  const orderIds = new Set(filteredOrders.map((o) => o.id));
  const orderItems = (orderItemsRaw ?? []).filter((i) => orderIds.has(i.order_id)) as ReportOrderItemRow[];

  const categoryNameById = new Map((categories ?? []).map((c) => [c.id, c.name]));
  const categoryByItemId = new Map(
    (menuItems ?? []).map((m) => [m.id, (m.category_id && categoryNameById.get(m.category_id)) || "Uncategorized"]),
  );

  const totalSales = sumTotal(filteredOrders);
  const avgOrder = averageOrderValue(filteredOrders);
  const revenueByDay = aggregateRevenueByDay(filteredOrders, from, to, tenant.timezone);
  const topItems = aggregateTopItems(orderItems);
  const categoryPerf = aggregateCategoryPerformance(orderItems, categoryByItemId);
  const paymentBreakdown = aggregatePaymentMethods(filteredOrders);
  const salesRows = buildSalesReportRows(filteredOrders, tenant.timezone);

  const basePath = `/${slug}/reports`;

  return (
    <div className="flex flex-col gap-6">
      <FadeIn>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
          <p className="text-sm text-muted-foreground">Sales performance for {tenant.name}.</p>
        </div>
      </FadeIn>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <ReportsFilterBar basePath={basePath} from={from} to={to} status={status ?? ""} payment={payment ?? ""} />
        <ExportButtons rows={salesRows} filenameBase={`sales-report_${from}_to_${to}`} />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Total sales"
          value={totalSales}
          currency={tenant.currency}
          icon={<CalendarRange className="size-4" aria-hidden />}
          tone="primary"
          description={`${from} to ${to}`}
          delay={0}
        />
        <StatCard
          label="Orders"
          value={filteredOrders.length}
          icon={<ListOrdered className="size-4" aria-hidden />}
          tone="muted"
          description="matching current filters"
          delay={0.05}
        />
        <StatCard
          label="Average order value"
          value={avgOrder}
          currency={tenant.currency}
          icon={<ReceiptText className="size-4" aria-hidden />}
          tone="muted"
          description="per order in range"
          delay={0.1}
        />
      </div>

      <FadeIn delay={0.15}>
        <Card>
          <CardHeader>
            <CardTitle>Revenue trend</CardTitle>
            <CardDescription>
              {from} to {to}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RevenueTrendChart data={revenueByDay} currency={tenant.currency} ariaLabel={`Revenue from ${from} to ${to}`} />
          </CardContent>
        </Card>
      </FadeIn>

      <div className="grid gap-4 lg:grid-cols-2">
        <FadeIn delay={0.2}>
          <Card className="h-full">
            <CardHeader>
              <CardTitle>Top selling items</CardTitle>
              <CardDescription>By revenue, current range</CardDescription>
            </CardHeader>
            <CardContent>
              {topItems.length > 0 ? (
                <ul className="divide-y">
                  {topItems.map((item) => (
                    <li key={item.name} className="flex items-center justify-between gap-4 py-2 text-sm">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{item.name}</p>
                        <p className="text-xs text-muted-foreground">{item.qty} sold</p>
                      </div>
                      <span className="shrink-0 font-medium tabular-nums">{formatMoney(item.revenue, tenant.currency)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No items sold in this range.</p>
              )}
            </CardContent>
          </Card>
        </FadeIn>

        <FadeIn delay={0.25}>
          <Card className="h-full">
            <CardHeader>
              <CardTitle>Category performance</CardTitle>
              <CardDescription>By revenue, current range</CardDescription>
            </CardHeader>
            <CardContent>
              {categoryPerf.length > 0 ? (
                <ul className="divide-y">
                  {categoryPerf.map((cat) => (
                    <li key={cat.category} className="flex items-center justify-between gap-4 py-2 text-sm">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{cat.category}</p>
                        <p className="text-xs text-muted-foreground">{cat.qty} sold</p>
                      </div>
                      <span className="shrink-0 font-medium tabular-nums">{formatMoney(cat.revenue, tenant.currency)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No items sold in this range.</p>
              )}
            </CardContent>
          </Card>
        </FadeIn>
      </div>

      <FadeIn delay={0.3}>
        <Card>
          <CardHeader>
            <CardTitle>Payment methods</CardTitle>
            <CardDescription>Share of revenue by payment method</CardDescription>
          </CardHeader>
          <CardContent>
            <PaymentMethodBreakdown data={paymentBreakdown} currency={tenant.currency} />
          </CardContent>
        </Card>
      </FadeIn>

      <FadeIn delay={0.35}>
        <Card>
          <CardHeader>
            <CardTitle>Orders</CardTitle>
            <CardDescription>
              {filteredOrders.length} order{filteredOrders.length === 1 ? "" : "s"} in range
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {salesRows.length > 0 ? (
              <div className="max-h-[480px] overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-card text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2 font-medium">Order #</th>
                      <th className="px-4 py-2 font-medium">Date</th>
                      <th className="px-4 py-2 font-medium">Status</th>
                      <th className="px-4 py-2 font-medium">Payment</th>
                      <th className="px-4 py-2 font-medium">Customer</th>
                      <th className="px-4 py-2 text-right font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredOrders.map((order, i) => (
                      <tr key={order.id}>
                        <td className="px-4 py-2 font-medium">#{order.order_number}</td>
                        <td className="px-4 py-2 text-muted-foreground">{salesRows[i]?.date}</td>
                        <td className="px-4 py-2">
                          <StatusBadge status={order.status} />
                        </td>
                        <td className="px-4 py-2 text-muted-foreground">{salesRows[i]?.paymentMethod.toUpperCase()}</td>
                        <td className="px-4 py-2 text-muted-foreground">{order.customer_name ?? "—"}</td>
                        <td className="px-4 py-2 text-right font-medium tabular-nums">{formatMoney(order.total, tenant.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="px-4 py-12 text-center text-sm text-muted-foreground">No orders match these filters.</p>
            )}
          </CardContent>
        </Card>
      </FadeIn>
    </div>
  );
}
