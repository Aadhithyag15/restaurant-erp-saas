"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ORDER_STATUS_LABELS, ORDER_STATUSES } from "@/lib/orders";
import type { OrderStatus } from "@/types/database";

const BAR_CLASS: Record<OrderStatus, string> = {
  pending: "bg-muted-foreground/40",
  preparing: "bg-warning",
  ready: "bg-success",
  served: "bg-primary/50",
};

export function OrderStatusBreakdown({ counts }: { counts: Record<OrderStatus, number> }) {
  const prefersReducedMotion = useReducedMotion();
  const total = ORDER_STATUSES.reduce((sum, status) => sum + counts[status], 0);

  if (total === 0) {
    return <p className="text-sm text-muted-foreground">No orders placed today yet.</p>;
  }

  return (
    <ul className="space-y-3">
      {ORDER_STATUSES.map((status) => {
        const count = counts[status];
        const pct = total > 0 ? (count / total) * 100 : 0;
        return (
          <li key={status}>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{ORDER_STATUS_LABELS[status]}</span>
              <span className="font-medium tabular-nums">{count}</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <motion.div
                className={`h-full rounded-full ${BAR_CLASS[status]}`}
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: prefersReducedMotion ? 0 : 0.6, ease: [0.16, 1, 0.3, 1] }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
