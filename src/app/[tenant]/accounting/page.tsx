import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ChevronRight, IndianRupee, ReceiptText, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FadeIn } from "@/components/motion/fade-in";
import { StatCard } from "@/components/dashboard/stat-card";
import { DailyClosingForm } from "@/components/accounting/daily-closing-form";
import { round2 } from "@/lib/menu";
import { formatMoney } from "@/lib/money";
import { parseReportDateParam } from "@/lib/reports";
import { createClient } from "@/lib/supabase/server";
import { localDayRangeUtc, shiftDateString, todayInTimeZone } from "@/lib/timezone";
import type { MemberRole } from "@/types/database";

export const metadata = { title: "Accounting" };

const ACCOUNTING_ROLES: MemberRole[] = ["owner", "admin"];
const HISTORY_LIMIT = 14;

type SearchParams = Record<string, string | string[] | undefined>;

export default async function AccountingPage({
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
  if (!membership || !ACCOUNTING_ROLES.includes(membership.role)) {
    redirect(`/${slug}/dashboard`);
  }

  const today = todayInTimeZone(tenant.timezone);
  let date = parseReportDateParam(sp.date) || today;
  if (date > today) date = today;

  const [{ data: closing }, { data: history }] = await Promise.all([
    supabase.from("daily_closings").select("opening_cash, closing_cash, cash_refunds, notes").eq("tenant_id", tenant.id).eq("closing_date", date).maybeSingle(),
    supabase
      .from("daily_closings")
      .select("closing_date, opening_cash, closing_cash, cash_refunds, notes")
      .eq("tenant_id", tenant.id)
      .order("closing_date", { ascending: false })
      .limit(HISTORY_LIMIT),
  ]);

  const historyRows = history ?? [];
  const allDates = [date, ...historyRows.map((h) => h.closing_date)];
  const rangeFrom = allDates.reduce((min, d) => (d < min ? d : min), date);
  const rangeTo = allDates.reduce((max, d) => (d > max ? d : max), date);

  const { start: rangeStart } = localDayRangeUtc(rangeFrom, tenant.timezone);
  const { end: rangeEnd } = localDayRangeUtc(rangeTo, tenant.timezone);

  const { data: ordersInRange } = await supabase
    .from("orders")
    .select("total, created_at")
    .eq("tenant_id", tenant.id)
    .gte("created_at", rangeStart)
    .lt("created_at", rangeEnd);

  const salesByDate = new Map<string, { sales: number; count: number }>();
  for (const o of ordersInRange ?? []) {
    const day = new Date(o.created_at).toLocaleDateString("en-CA", { timeZone: tenant.timezone });
    const bucket = salesByDate.get(day) ?? { sales: 0, count: 0 };
    bucket.sales = round2(bucket.sales + o.total);
    bucket.count += 1;
    salesByDate.set(day, bucket);
  }

  const totalSales = salesByDate.get(date)?.sales ?? 0;
  const orderCount = salesByDate.get(date)?.count ?? 0;
  const cashRefunds = closing?.cash_refunds ?? 0;
  const netRevenue = round2(totalSales - cashRefunds);

  const basePath = `/${slug}/accounting`;
  const prevDate = shiftDateString(date, -1);
  const nextDate = shiftDateString(date, 1);
  const dateLabel = new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });

  return (
    <div className="flex flex-col gap-6">
      <FadeIn>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Accounting</h1>
          <p className="text-sm text-muted-foreground">Daily cash closing for {tenant.name}.</p>
        </div>
      </FadeIn>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="icon">
            <Link href={`${basePath}?date=${prevDate}`} aria-label="Previous day">
              <ChevronLeft aria-hidden />
            </Link>
          </Button>
          <form action={basePath} className="flex items-center gap-2">
            <input
              type="date"
              name="date"
              defaultValue={date}
              max={today}
              className="flex h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <Button type="submit" variant="outline">
              Go
            </Button>
          </form>
          <Button asChild variant="outline" size="icon">
            <Link
              href={`${basePath}?date=${nextDate}`}
              aria-label="Next day"
              aria-disabled={nextDate > today}
              tabIndex={nextDate > today ? -1 : undefined}
              className={nextDate > today ? "pointer-events-none opacity-50" : ""}
            >
              <ChevronRight aria-hidden />
            </Link>
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">{dateLabel}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total sales"
          value={totalSales}
          currency={tenant.currency}
          icon={<IndianRupee className="size-4" aria-hidden />}
          tone="primary"
          description={`across ${orderCount} order${orderCount === 1 ? "" : "s"}`}
          delay={0}
        />
        <StatCard
          label="Opening cash"
          value={closing?.opening_cash ?? 0}
          currency={tenant.currency}
          icon={<Wallet className="size-4" aria-hidden />}
          tone="muted"
          description="counted at start of day"
          delay={0.05}
        />
        <StatCard
          label="Closing cash"
          value={closing?.closing_cash ?? 0}
          currency={tenant.currency}
          icon={<Wallet className="size-4" aria-hidden />}
          tone="muted"
          description="counted at end of day"
          delay={0.1}
        />
        <StatCard
          label="Net revenue"
          value={netRevenue}
          currency={tenant.currency}
          icon={<ReceiptText className="size-4" aria-hidden />}
          tone="success"
          description={`sales less ${formatMoney(cashRefunds, tenant.currency)} refunds`}
          delay={0.15}
        />
      </div>

      <FadeIn delay={0.2}>
        <Card>
          <CardHeader>
            <CardTitle>Record closing</CardTitle>
            <CardDescription>Enter the counted cash drawer totals for {dateLabel}.</CardDescription>
          </CardHeader>
          <CardContent>
            <DailyClosingForm
              tenantId={tenant.id}
              slug={slug}
              closingDate={date}
              initial={
                closing
                  ? {
                      openingCash: closing.opening_cash,
                      closingCash: closing.closing_cash,
                      cashRefunds: closing.cash_refunds,
                      notes: closing.notes,
                    }
                  : null
              }
            />
          </CardContent>
        </Card>
      </FadeIn>

      <FadeIn delay={0.25}>
        <Card>
          <CardHeader>
            <CardTitle>Recent closings</CardTitle>
            <CardDescription>Last {HISTORY_LIMIT} recorded days</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {historyRows.length > 0 ? (
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2 font-medium">Date</th>
                      <th className="px-4 py-2 text-right font-medium">Total sales</th>
                      <th className="px-4 py-2 text-right font-medium">Opening cash</th>
                      <th className="px-4 py-2 text-right font-medium">Closing cash</th>
                      <th className="px-4 py-2 text-right font-medium">Refunds</th>
                      <th className="px-4 py-2 text-right font-medium">Net revenue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {historyRows.map((row) => {
                      const sales = salesByDate.get(row.closing_date)?.sales ?? 0;
                      const net = round2(sales - row.cash_refunds);
                      return (
                        <tr key={row.closing_date}>
                          <td className="px-4 py-2">
                            <Link href={`${basePath}?date=${row.closing_date}`} className="font-medium hover:underline">
                              {row.closing_date}
                            </Link>
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums">{formatMoney(sales, tenant.currency)}</td>
                          <td className="px-4 py-2 text-right tabular-nums">{formatMoney(row.opening_cash, tenant.currency)}</td>
                          <td className="px-4 py-2 text-right tabular-nums">{formatMoney(row.closing_cash, tenant.currency)}</td>
                          <td className="px-4 py-2 text-right tabular-nums">{formatMoney(row.cash_refunds, tenant.currency)}</td>
                          <td className="px-4 py-2 text-right font-medium tabular-nums">{formatMoney(net, tenant.currency)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="px-4 py-12 text-center text-sm text-muted-foreground">No closings recorded yet.</p>
            )}
          </CardContent>
        </Card>
      </FadeIn>
    </div>
  );
}
