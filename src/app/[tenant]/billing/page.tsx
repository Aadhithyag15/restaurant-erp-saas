import { notFound } from "next/navigation";
import { BadgeCheck } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { deriveLicense } from "@/lib/license";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Billing" };

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
}

export default async function BillingPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: slug } = await params;
  const supabase = await createClient();

  const { data: tenant } = await supabase.from("tenants").select("id, currency").eq("slug", slug).maybeSingle();
  if (!tenant) notFound();

  const [{ data: subscription }, { data: plans }] = await Promise.all([
    supabase
      .from("subscriptions")
      .select("status, trial_ends_at, current_period_end, plan_id")
      .eq("tenant_id", tenant.id)
      .maybeSingle(),
    supabase.from("plans").select("id, code, name, price_monthly, limits").eq("is_active", true).order("price_monthly"),
  ]);

  const license = deriveLicense(subscription);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
        <p className="text-sm text-muted-foreground">Your plan, trial status and upgrade options.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Current status</CardTitle>
          <CardDescription>
            {license.state === "trialing" && (
              <>
                Free trial — ends {formatDate(subscription?.trial_ends_at ?? null)} ({license.daysLeft} day
                {license.daysLeft === 1 ? "" : "s"} left).
              </>
            )}
            {license.state === "active" && <>Subscription active until {formatDate(subscription?.current_period_end ?? null)}.</>}
            {license.state === "expired" && <>Trial ended. Your data is intact and exportable; activate a plan to resume operations.</>}
            {license.state === "none" && <>No subscription found — contact support.</>}
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        {(plans ?? [])
          .filter((p) => p.code !== "trial")
          .map((plan) => (
            <Card key={plan.id} className={plan.id === subscription?.plan_id ? "border-primary" : undefined}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {plan.name}
                  {plan.id === subscription?.plan_id ? <BadgeCheck className="size-4 text-success" aria-hidden /> : null}
                </CardTitle>
                <CardDescription>
                  ₹{Number(plan.price_monthly).toLocaleString("en-IN")} / month
                </CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {JSON.stringify(plan.limits) !== "{}" ? (
                  <ul className="list-inside list-disc space-y-1">
                    {Object.entries(plan.limits as Record<string, number>).map(([k, v]) => (
                      <li key={k}>
                        Up to {v} {k}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </CardContent>
            </Card>
          ))}
      </div>

      <p className="text-sm text-muted-foreground">
        Online payment (Razorpay/Stripe) ships in Phase 6. Until then, plans are activated manually —
        contact support to upgrade.
      </p>
    </div>
  );
}
