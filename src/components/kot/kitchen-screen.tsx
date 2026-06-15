"use client";

import * as React from "react";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { Clock, Soup, UtensilsCrossed } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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

const COLUMNS: { status: OrderStatus; label: string; accent: string; icon: typeof Soup }[] = [
  { status: "pending", label: "New", accent: "text-warning", icon: Soup },
  { status: "preparing", label: "Preparing", accent: "text-primary", icon: UtensilsCrossed },
  { status: "ready", label: "Ready", accent: "text-success", icon: UtensilsCrossed },
];

const COLUMN_ACCENT_BORDER: Record<OrderStatus, string> = {
  pending: "border-l-warning",
  preparing: "border-l-primary",
  ready: "border-l-success",
  served: "border-l-muted-foreground/30",
};

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

type Urgency = "ok" | "warn" | "late";

const URGENCY_BADGE: Record<Urgency, { label: string; variant: "secondary" | "warning" | "destructive" }> = {
  ok: { label: "New", variant: "secondary" },
  warn: { label: "Attention", variant: "warning" },
  late: { label: "Late", variant: "destructive" },
};

const URGENCY_RING: Record<Urgency, string> = {
  ok: "",
  warn: "ring-1 ring-warning/40",
  late: "ring-2 ring-destructive/50",
};

/** Live "Xm ago" label + urgency tier; renders empty/"ok" on the server/first paint to avoid hydration drift. */
function useElapsed(since: string): { label: string; urgency: Urgency } {
  const [state, setState] = React.useState<{ label: string; urgency: Urgency }>({ label: "", urgency: "ok" });

  React.useEffect(() => {
    const update = () => {
      const minutes = Math.max(0, Math.floor((Date.now() - new Date(since).getTime()) / 60000));
      const urgency: Urgency = minutes >= 20 ? "late" : minutes >= 10 ? "warn" : "ok";
      setState({ label: minutes < 1 ? "just now" : `${minutes}m ago`, urgency });
    };
    update();
    const interval = setInterval(update, 30_000);
    return () => clearInterval(interval);
  }, [since]);

  return state;
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
  const { label: elapsed, urgency } = useElapsed(order.status === "pending" ? order.createdAt : order.statusUpdatedAt);
  const nextStatus = NEXT_STATUS[order.status];
  const badge = URGENCY_BADGE[urgency];

  return (
    <Card className={cn("border-l-4", COLUMN_ACCENT_BORDER[order.status], URGENCY_RING[urgency])}>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="font-mono text-base">#{order.orderNumber}</CardTitle>
        <div className="flex items-center gap-2">
          {elapsed ? (
            <span className="flex items-center gap-1 font-mono text-xs text-muted-foreground">
              <Clock className="size-3" aria-hidden />
              {elapsed}
            </span>
          ) : null}
          {elapsed && urgency !== "ok" ? <Badge variant={badge.variant}>{badge.label}</Badge> : null}
        </div>
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
              <span className="w-8 shrink-0 font-mono font-semibold tabular-nums">{item.qty}×</span>
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
        <LayoutGroup>
          <div className="grid gap-4 md:grid-cols-3">
            {COLUMNS.map((column) => {
              const columnOrders = orders
                .filter((o) => o.status === column.status)
                .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
              const Icon = column.icon;

              return (
                <div key={column.status} className="flex flex-col gap-3">
                  <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2">
                    <h2 className={cn("flex items-center gap-2 text-sm font-semibold uppercase tracking-wide", column.accent)}>
                      <Icon className="size-4" aria-hidden />
                      {column.label}
                    </h2>
                    <span className="rounded-full bg-background px-2 py-0.5 font-mono text-xs font-medium text-foreground shadow-[var(--shadow-sm)]">
                      {columnOrders.length}
                    </span>
                  </div>
                  <div className="flex flex-col gap-3">
                    {columnOrders.length === 0 ? (
                      <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">No orders</p>
                    ) : (
                      <AnimatePresence initial={false}>
                        {columnOrders.map((order) => (
                          <motion.div
                            key={order.id}
                            layoutId={order.id}
                            layout
                            initial={{ opacity: 0, scale: 0.96 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.96 }}
                            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                          >
                            <OrderCard order={order} busy={busyIds.has(order.id)} error={errors[order.id] ?? null} onAdvance={onAdvance} />
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </LayoutGroup>
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
