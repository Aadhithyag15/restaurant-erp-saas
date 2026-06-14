import { notFound } from "next/navigation";
import { CalendarClock, ChefHat, IndianRupee, Receipt, Store, TrendingUp, Users } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { deriveLicense } from "@/lib/license";
import { formatMoney } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { localDayRangeUtc, todayInTimeZone } from "@/lib/timezone";

export const metadata = { title: "Dashboard" };

const OPEN_KITCHEN_STATUSES = ["pending", "preparing", "ready"] as const;

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
    supabase.from("orders").select("total, created_at").eq("tenant_id", tenant.id).gte("created_at", weekStart).lt("created_at", todayEnd),
    supabase.from("orders").select("id", { count: "exact", head: true }).eq("tenant_id", tenant.id).in("status", OPEN_KITCHEN_STATUSES),
  ]);

  const license = deriveLicense(subscription);

  const allRecent = recentOrders ?? [];
  const todaysOrders = allRecent.filter((o) => o.created_at >= todayStart);
  const todaysSales = todaysOrders.reduce((sum, o) => sum + o.total, 0);
  const weekRevenue = allRecent.reduce((sum, o) => sum + o.total, 0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{tenant.name}</h1>
        <p className="text-sm text-muted-foreground">Today&apos;s performance at a glance.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Today&apos;s sales</CardTitle>
            <IndianRupee className="size-4 text-muted-foreground" aria-hidden />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{formatMoney(todaysSales, tenant.currency)}</p>
            <p className="text-sm text-muted-foreground">
              across {todaysOrders.length} order{todaysOrders.length === 1 ? "" : "s"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Today&apos;s orders</CardTitle>
            <Receipt className="size-4 text-muted-foreground" aria-hidden />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{todaysOrders.length}</p>
            <p className="text-sm text-muted-foreground">placed since midnight</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active kitchen orders</CardTitle>
            <ChefHat className="size-4 text-muted-foreground" aria-hidden />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{activeKitchenCount ?? 0}</p>
            <p className="text-sm text-muted-foreground">pending, preparing or ready</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Revenue (7 days)</CardTitle>
            <TrendingUp className="size-4 text-muted-foreground" aria-hidden />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{formatMoney(weekRevenue, tenant.currency)}</p>
            <p className="text-sm text-muted-foreground">
              across {allRecent.length} order{allRecent.length === 1 ? "" : "s"}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">License</CardTitle>
            <CalendarClock className="size-4 text-muted-foreground" aria-hidden />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold capitalize">{license.state}</p>
            <p className="text-sm text-muted-foreground">
              {license.state === "trialing"
                ? `${license.daysLeft} day${license.daysLeft === 1 ? "" : "s"} of free trial left`
                : license.state === "active"
                  ? "Subscription active"
                  : "Activate a plan to resume"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Team</CardTitle>
            <Users className="size-4 text-muted-foreground" aria-hidden />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{staffCount ?? 0}</p>
            <p className="text-sm text-muted-foreground">active staff member{(staffCount ?? 0) === 1 ? "" : "s"}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Outlets</CardTitle>
            <Store className="size-4 text-muted-foreground" aria-hidden />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{outletCount ?? 0}</p>
            <p className="text-sm text-muted-foreground">active location{(outletCount ?? 0) === 1 ? "" : "s"}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>What&apos;s next</CardTitle>
          <CardDescription>Your restaurant is live. Upcoming milestones on the build plan:</CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="list-inside list-decimal space-y-1 text-sm text-muted-foreground">
            <li>Inventory, SKUs and stock depletion (Phase 5)</li>
            <li>Accounting, reports and PDF/Excel exports (Phase 6)</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
