import { notFound } from "next/navigation";
import { CalendarClock, ChefHat, IndianRupee, Receipt, Store, TrendingUp, Users } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FadeIn } from "@/components/motion/fade-in";
import { StatCard } from "@/components/dashboard/stat-card";
import { RevenueTrendChart } from "@/components/dashboard/revenue-trend-chart";
import { OrderStatusBreakdown } from "@/components/dashboard/order-status-breakdown";
import { RadialGauge } from "@/components/dashboard/radial-gauge";
import { deriveLicense } from "@/lib/license";
import { formatMoney } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { localDayRangeUtc, shiftDateString, todayInTimeZone } from "@/lib/timezone";
import { ORDER_STATUSES } from "@/lib/orders";
import type { OrderStatus } from "@/types/database";

export const metadata = { title: "Dashboard" };

const OPEN_KITCHEN_STATUSES = ["pending", "preparing", "ready"] as const;
const TRIAL_DAYS = 14;

export default async function DashboardPage({ params }: { params: Promise<{ tenant: string }> }) {

  const { tenant: slug } = await params;
  const supabase = await createClient();

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, name, currency, timezone")
    .eq("slug", slug)
    .maybeSingle();

  if (!tenant) notFound();

  const today = todayInTimeZone(tenant.timezone);
  const { start: todayStart, end: todayEnd } = localDayRangeUtc(today, tenant.timezone);
  const weekStart = new Date(new Date(todayStart).getTime() - 6 * 24 * 60 * 60 * 1000).toISOString();

  const [{ data: subscription }, { count: staffCount }, { count: outletCount }, { data: recentOrders }, { count: activeKitchenCount }] = await Promise.all([
    supabase
      .from("subscriptions")
      .select("status, trial_ends_at, current_period_end")
      .eq("tenant_id", tenant.id)
      .maybeSingle(),
    supabase.from("memberships").select("id", { count: "exact", head: true }).eq("tenant_id", tenant.id).eq("is_active", true),
    supabase.from("outlets").select("id", { count: "exact", head: true }).eq("tenant_id", tenant.id).eq("is_active", true),
    supabase.from("orders").select("total, created_at, status").eq("tenant_id", tenant.id).gte("created_at", weekStart).lt("created_at", todayEnd),
    supabase.from("orders").select("id", { count: "exact", head: true }).eq("tenant_id", tenant.id).in("status", OPEN_KITCHEN_STATUSES),
  ]);

  const license = deriveLicense(subscription);

  const allRecent = recentOrders ?? [];
  const todaysOrders = allRecent.filter((o) => o.created_at >= todayStart);
  const todaysSales = todaysOrders.reduce((sum, o) => sum + o.total, 0);
  const weekRevenue = allRecent.reduce((sum, o) => sum + o.total, 0);

  const revenueSeries = Array.from({ length: 7 }, (_, i) => {
    const dateStr = shiftDateString(today, -(6 - i));
    const { start, end } = localDayRangeUtc(dateStr, tenant.timezone);
    const value = allRecent
      .filter((o) => o.created_at >= start && o.created_at < end)
      .reduce((sum, o) => sum + o.total, 0);
    const label = new Date(`${dateStr}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
    return { label, value };
  });

  const statusCounts = ORDER_STATUSES.reduce((acc, status) => {
    acc[status] = 0;
    return acc;
  }, {} as Record<OrderStatus, number>);
  for (const order of todaysOrders) {
    const status = order.status as OrderStatus;
    statusCounts[status] = (statusCounts[status] ?? 0) + 1;
  }

  return (
    <div className="flex flex-col gap-6">
      <FadeIn>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{tenant.name}</h1>
          <p className="text-sm text-muted-foreground">Today&apos;s performance at a glance.</p>
        </div>
      </FadeIn>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Today's sales"
          value={todaysSales}
          format={(v) => formatMoney(v, tenant.currency)}
          icon={<IndianRupee className="size-4" aria-hidden />}
          tone="primary"
          description={`across ${todaysOrders.length} order${todaysOrders.length === 1 ? "" : "s"}`}
          delay={0}
        />
        <StatCard
          label="Today's orders"
          value={todaysOrders.length}
          icon={<Receipt className="size-4" aria-hidden />}
          tone="muted"
          description="placed since midnight"
          delay={0.05}
        />
        <StatCard
          label="Active kitchen orders"
          value={activeKitchenCount ?? 0}
          icon={<ChefHat className="size-4" aria-hidden />}
          tone="warning"
          description="pending, preparing or ready"
          delay={0.1}
        />
        <StatCard
          label="Revenue (7 days)"
          value={weekRevenue}
          format={(v) => formatMoney(v, tenant.currency)}
          icon={<TrendingUp className="size-4" aria-hidden />}
          tone="success"
          description={`across ${allRecent.length} order${allRecent.length === 1 ? "" : "s"}`}
          delay={0.15}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <FadeIn delay={0.2} className="lg:col-span-2">
          <Card className="h-full">
            <CardHeader>
              <CardTitle>Revenue trend</CardTitle>
              <CardDescription>Last 7 days</CardDescription>
            </CardHeader>
            <CardContent>
              <RevenueTrendChart data={revenueSeries} currency={tenant.currency} />
            </CardContent>
          </Card>
        </FadeIn>

        <FadeIn delay={0.25}>
          <Card className="h-full">
            <CardHeader>
              <CardTitle>Today&apos;s orders</CardTitle>
              <CardDescription>By status</CardDescription>
            </CardHeader>
            <CardContent>
              <OrderStatusBreakdown counts={statusCounts} />
            </CardContent>
          </Card>
        </FadeIn>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <FadeIn delay={0.3}>
          <Card className="h-full">
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">License</CardTitle>
              <CalendarClock className="size-4 text-muted-foreground" aria-hidden />
            </CardHeader>
            <CardContent className="flex items-center gap-4">
              {license.state === "trialing" && license.daysLeft !== null ? (
                <RadialGauge value={license.daysLeft} max={TRIAL_DAYS} label={`${license.daysLeft}d`} />
              ) : null}
              <div>
                <p className="text-2xl font-semibold capitalize">{license.state}</p>
                <p className="text-sm text-muted-foreground">
                  {license.state === "trialing"
                    ? `${license.daysLeft} day${license.daysLeft === 1 ? "" : "s"} of free trial left`
                    : license.state === "active"
                      ? "Subscription active"
                      : "Activate a plan to resume"}
                </p>
              </div>
            </CardContent>
          </Card>
        </FadeIn>

        <StatCard
          label="Team"
          value={staffCount ?? 0}
          icon={<Users className="size-4" aria-hidden />}
          tone="muted"
          description={`active staff member${(staffCount ?? 0) === 1 ? "" : "s"}`}
          delay={0.35}
        />

        <StatCard
          label="Outlets"
          value={outletCount ?? 0}
          icon={<Store className="size-4" aria-hidden />}
          tone="muted"
          description={`active location${(outletCount ?? 0) === 1 ? "" : "s"}`}
          delay={0.4}
        />
      </div>

      <FadeIn delay={0.45}>
        <Card>
          <CardHeader>
            <CardTitle>What&apos;s next</CardTitle>
            <CardDescription>Your restaurant is live. Upcoming milestones on the build plan:</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="list-inside list-decimal space-y-1 text-sm text-muted-foreground">
              <li>Accounting, reports and PDF/Excel exports (Phase 6)</li>
            </ol>
          </CardContent>
        </Card>
      </FadeIn>
    </div>
  );
}
