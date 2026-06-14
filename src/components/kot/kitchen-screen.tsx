"use client";

import * as React from "react";
import { Clock, Soup, UtensilsCrossed } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { VegMark } from "@/components/menu/veg-mark";
import { updateOrderStatus } from "@/lib/actions/orders";
import { sourceLabel } from "@/lib/orders";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { Database, OrderStatus } from "@/types/database";

export type KotItem = { id: string; name: string; qty: number; isVeg: boolean };
export type KotOrder = {
  id: string;
  orderNumber: number;
  status: OrderStatus;
  customerName: string | null;
  source: string;
  notes: string | null;
  createdAt: string;
  statusUpdatedAt: string;
  items: KotItem[];
};

type OrderRow = Database["public"]["Tables"]["orders"]["Row"];

const OPEN_STATUSES: OrderStatus[] = ["pending", "preparing", "ready"];

const COLUMNS: { status: OrderStatus; label: string }[] = [
  { status: "pending", label: "New" },
  { status: "preparing", label: "Preparing" },
  { status: "ready", label: "Ready" },
];

const NEXT_STATUS: Record<OrderStatus, OrderStatus | null> = {
  pending: "preparing",
  preparing: "ready",
  ready: "served",
  served: null,
};

const ACTION_LABEL: Record<OrderStatus, string> = {
  pending: "Start preparing",
  preparing: "Mark ready",
  ready: "Mark served",
  served: "",
};

/** Live "Xm ago" label; renders empty on the server/first paint to avoid hydration drift. */
function useElapsedLabel(since: string): string {
  const [label, setLabel] = React.useState("");

  React.useEffect(() => {
    const update = () => {
      const minutes = Math.max(0, Math.floor((Date.now() - new Date(since).getTime()) / 60000));
      setLabel(minutes < 1 ? "just now" : `${minutes}m ago`);
    };
    update();
    const interval = setInterval(update, 30_000);
    return () => clearInterval(interval);
  }, [since]);

  return label;
}

function OrderCard({
  order,
  busy,
  error,
  onAdvance,
}: {
  order: KotOrder;
  busy: boolean;
  error: string | null;
  onAdvance: (order: KotOrder) => void;
}) {
  const elapsed = useElapsedLabel(order.status === "pending" ? order.createdAt : order.statusUpdatedAt);
  const nextStatus = NEXT_STATUS[order.status];

  return (
    <Card className={cn(order.status === "ready" && "border-success")}>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="text-base">Order #{order.orderNumber}</CardTitle>
        {elapsed ? (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="size-3" aria-hidden />
            {elapsed}
          </span>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {order.customerName || order.source !== "walk_in" ? (
          <p className="text-sm text-muted-foreground">
            {order.customerName ? order.customerName : null}
            {order.customerName && order.source !== "walk_in" ? " · " : null}
            {order.source !== "walk_in" ? sourceLabel(order.source) : null}
          </p>
        ) : null}

        <ul className="flex flex-col gap-1.5">
          {order.items.map((item) => (
            <li key={item.id} className="flex items-start gap-2 text-sm">
              <span className="w-8 shrink-0 font-semibold tabular-nums">{item.qty}×</span>
              <VegMark isVeg={item.isVeg} className="mt-0.5" />
              <span className="min-w-0 flex-1">{item.name}</span>
            </li>
          ))}
        </ul>

        {order.notes ? (
          <p className="rounded-md bg-secondary px-2 py-1 text-sm text-secondary-foreground">{order.notes}</p>
        ) : null}

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        {nextStatus ? (
          <Button type="button" className="w-full" disabled={busy} onClick={() => onAdvance(order)}>
            {busy ? "Updating…" : ACTION_LABEL[order.status]}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function KitchenScreen({ tenantId, initialOrders }: { tenantId: string; initialOrders: KotOrder[] }) {
  const [orders, setOrders] = React.useState<KotOrder[]>(initialOrders);
  const [busyIds, setBusyIds] = React.useState<Set<string>>(new Set());
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const handleInsert = React.useCallback(async (row: OrderRow) => {
    if (row.tenant_id !== tenantId || !OPEN_STATUSES.includes(row.status)) return;

    const supabase = createClient();
    const { data: items } = await supabase
      .from("order_items")
      .select("id, name, qty, is_veg")
      .eq("order_id", row.id)
      .order("created_at");

    const newOrder: KotOrder = {
      id: row.id,
      orderNumber: row.order_number,
      status: row.status,
      customerName: row.customer_name,
      source: row.source,
      notes: row.notes,
      createdAt: row.created_at,
      statusUpdatedAt: row.status_updated_at,
      items: (items ?? []).map((i) => ({ id: i.id, name: i.name, qty: i.qty, isVeg: i.is_veg })),
    };

    setOrders((prev) => (prev.some((o) => o.id === newOrder.id) ? prev : [...prev, newOrder]));
  }, [tenantId]);

  const handleUpdate = React.useCallback((row: OrderRow) => {
    if (row.tenant_id !== tenantId) return;
    setOrders((prev) => {
      if (row.status === "served") return prev.filter((o) => o.id !== row.id);
      return prev.map((o) => (o.id === row.id ? { ...o, status: row.status, statusUpdatedAt: row.status_updated_at } : o));
    });
  }, [tenantId]);

  React.useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    // The realtime client only authenticates its socket with the user's JWT
    // once the auth session has loaded from storage; subscribing before that
    // joins as `anon`, which RLS (orders_select ... to authenticated) then
    // silently excludes from every postgres_changes broadcast. Waiting for
    // getSession() ensures the access token is set before we join.
    void supabase.auth.getSession().then(() => {
      if (cancelled) return;
      channel = supabase
        .channel(`kot:${tenantId}`)
        .on<OrderRow>(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "orders", filter: `tenant_id=eq.${tenantId}` },
          (payload) => void handleInsert(payload.new),
        )
        .on<OrderRow>(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "orders", filter: `tenant_id=eq.${tenantId}` },
          (payload) => handleUpdate(payload.new),
        )
        .subscribe();
    });

    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [tenantId, handleInsert, handleUpdate]);

  const onAdvance = async (order: KotOrder) => {
    const next = NEXT_STATUS[order.status];
    if (!next) return;

    setBusyIds((prev) => new Set(prev).add(order.id));
    setErrors((prev) => {
      if (!(order.id in prev)) return prev;
      const next = { ...prev };
      delete next[order.id];
      return next;
    });

    const result = await updateOrderStatus(tenantId, order.id, next);

    setBusyIds((prev) => {
      const copy = new Set(prev);
      copy.delete(order.id);
      return copy;
    });

    if (!result.ok) {
      setErrors((prev) => ({ ...prev, [order.id]: result.error }));
      return;
    }

    setOrders((prev) => {
      if (next === "served") return prev.filter((o) => o.id !== order.id);
      return prev.map((o) => (o.id === order.id ? { ...o, status: next, statusUpdatedAt: new Date().toISOString() } : o));
    });
  };

  const hasOrders = orders.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Kitchen</h1>
        <p className="text-sm text-muted-foreground">Live tickets update automatically as orders come in and move through prep.</p>
      </div>

      {hasOrders ? (
        <div className="grid gap-4 md:grid-cols-3">
          {COLUMNS.map((column) => {
            const columnOrders = orders
              .filter((o) => o.status === column.status)
              .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

            return (
              <div key={column.status} className="flex flex-col gap-3">
                <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  {column.status === "pending" ? <Soup className="size-4" aria-hidden /> : <UtensilsCrossed className="size-4" aria-hidden />}
                  {column.label}
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">{columnOrders.length}</span>
                </h2>
                <div className="flex flex-col gap-3">
                  {columnOrders.length === 0 ? (
                    <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">No orders</p>
                  ) : (
                    columnOrders.map((order) => (
                      <OrderCard key={order.id} order={order} busy={busyIds.has(order.id)} error={errors[order.id] ?? null} onAdvance={onAdvance} />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <Card className="flex flex-1 flex-col items-center justify-center py-16 text-center">
          <CardHeader>
            <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-secondary">
              <UtensilsCrossed className="size-5" aria-hidden />
            </div>
            <CardTitle>No active orders</CardTitle>
          </CardHeader>
        </Card>
      )}
    </div>
  );
}
