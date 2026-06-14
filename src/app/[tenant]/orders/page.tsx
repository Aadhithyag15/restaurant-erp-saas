import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { OrdersFilterBar } from "@/components/orders/orders-filter-bar";
import { StatusBadge } from "@/components/orders/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatMoney } from "@/lib/money";
import {
  ORDERS_PAGE_SIZE,
  parseDateFilter,
  parseOrderNumberQuery,
  parsePageParam,
  parseStatusFilter,
  sourceLabel,
} from "@/lib/orders";
import { createClient } from "@/lib/supabase/server";
import { localDayRangeUtc } from "@/lib/timezone";
import type { MemberRole, OrderStatus } from "@/types/database";

export const metadata = { title: "Orders" };

const ORDERS_ROLES: MemberRole[] = ["owner", "admin", "manager", "cashier"];

type SearchParams = Record<string, string | string[] | undefined>;

/** Builds a relative orders URL preserving the current filters with an updated page. */
function pageHref(basePath: string, q: string, status: string, date: string, page: number): string {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (status) params.set("status", status);
  if (date) params.set("date", date);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

export default async function OrdersPage({
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
  if (!membership || !ORDERS_ROLES.includes(membership.role)) {
    redirect(`/${slug}/dashboard`);
  }

  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const status = parseStatusFilter(sp.status);
  const date = parseDateFilter(sp.date);
  const page = parsePageParam(sp.page);
  const orderNumber = q ? parseOrderNumberQuery(q) : null;
  const searchHasNoMatch = q !== "" && orderNumber === null;

  let orders: { id: string; order_number: number; status: OrderStatus; customer_name: string | null; source: string; total: number; created_at: string }[] = [];
  let total = 0;

  if (!searchHasNoMatch) {
    let query = supabase
      .from("orders")
      .select("id, order_number, status, customer_name, source, total, created_at", { count: "exact" })
      .eq("tenant_id", tenant.id);

    if (orderNumber !== null) query = query.eq("order_number", orderNumber);
    if (status) query = query.eq("status", status);
    if (date) {
      const { start, end } = localDayRangeUtc(date, tenant.timezone);
      query = query.gte("created_at", start).lt("created_at", end);
    }

    const from = (page - 1) * ORDERS_PAGE_SIZE;
    const to = from + ORDERS_PAGE_SIZE - 1;
    const { data, count } = await query.order("created_at", { ascending: false }).range(from, to);
    orders = data ?? [];
    total = count ?? 0;
  }

  const totalPages = Math.max(1, Math.ceil(total / ORDERS_PAGE_SIZE));
  const basePath = `/${slug}/orders`;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Orders</h1>
        <p className="text-sm text-muted-foreground">All orders placed at {tenant.name}.</p>
      </div>

      <OrdersFilterBar basePath={basePath} q={q} status={status ?? ""} date={date} />

      <Card>
        <CardContent className="p-0">
          {orders.length > 0 ? (
            <ul className="divide-y">
              {orders.map((o) => (
                <li key={o.id}>
                  <Link
                    href={`${basePath}/${o.id}`}
                    className="flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-accent"
                  >
                    <div className="min-w-0">
                      <p className="font-medium">Order #{o.order_number}</p>
                      <p className="truncate text-sm text-muted-foreground">
                        {new Date(o.created_at).toLocaleString("en-IN", {
                          timeZone: tenant.timezone,
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                        {o.customer_name ? ` · ${o.customer_name}` : ""}
                        {o.source !== "walk_in" ? ` · ${sourceLabel(o.source)}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <StatusBadge status={o.status} />
                      <span className="font-medium tabular-nums">{formatMoney(o.total, tenant.currency)}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-12 text-center text-sm text-muted-foreground">
              {q || status || date ? "No orders match these filters." : "No orders yet."}
            </p>
          )}
        </CardContent>
      </Card>

      {totalPages > 1 ? (
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            Page {page} of {totalPages} · {total} order{total === 1 ? "" : "s"}
          </p>
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm">
              <Link
                href={pageHref(basePath, q, status ?? "", date, Math.max(1, page - 1))}
                aria-disabled={page <= 1}
                tabIndex={page <= 1 ? -1 : undefined}
                className={page <= 1 ? "pointer-events-none opacity-50" : ""}
              >
                Previous
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link
                href={pageHref(basePath, q, status ?? "", date, Math.min(totalPages, page + 1))}
                aria-disabled={page >= totalPages}
                tabIndex={page >= totalPages ? -1 : undefined}
                className={page >= totalPages ? "pointer-events-none opacity-50" : ""}
              >
                Next
              </Link>
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
