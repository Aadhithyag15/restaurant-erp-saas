import { notFound } from "next/navigation";
import { CalendarClock, Store, Users } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { deriveLicense } from "@/lib/license";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: slug } = await params;
  const supabase = await createClient();

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, name, currency")
    .eq("slug", slug)
    .maybeSingle();
  if (!tenant) notFound();

  const [{ data: subscription }, { count: staffCount }, { count: outletCount }] = await Promise.all([
    supabase
      .from("subscriptions")
      .select("status, trial_ends_at, current_period_end")
      .eq("tenant_id", tenant.id)
      .maybeSingle(),
    supabase.from("memberships").select("id", { count: "exact", head: true }).eq("tenant_id", tenant.id).eq("is_active", true),
    supabase.from("outlets").select("id", { count: "exact", head: true }).eq("tenant_id", tenant.id).eq("is_active", true),
  ]);

  const license = deriveLicense(subscription);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{tenant.name}</h1>
        <p className="text-sm text-muted-foreground">
          Sales, orders and kitchen stats appear here once the POS goes live (Phase 3).
        </p>
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
          <CardTitle>Getting started</CardTitle>
          <CardDescription>Your restaurant is provisioned. Next milestones on the build plan:</CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="list-inside list-decimal space-y-1 text-sm text-muted-foreground">
            <li>POS — menu, touch ordering, customer capture (Phase 3)</li>
            <li>Kitchen tickets with live updates (Phase 4)</li>
            <li>Inventory, SKUs and stock depletion (Phase 5)</li>
            <li>Accounting, reports and PDF/Excel exports (Phase 6)</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
