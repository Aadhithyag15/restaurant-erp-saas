"use client";

import { motion, useReducedMotion } from "framer-motion";
import { formatMoney } from "@/lib/money";
import { PAYMENT_METHOD_LABELS, type PaymentBreakdown } from "@/lib/reports";

const BAR_CLASS = ["bg-primary", "bg-success", "bg-warning", "bg-secondary-foreground/40", "bg-muted-foreground/40"];

export function PaymentMethodBreakdown({ data, currency }: { data: PaymentBreakdown[]; currency: string }) {
  const prefersReducedMotion = useReducedMotion();
  const total = data.reduce((sum, d) => sum + d.total, 0);

  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">No payments recorded for this range.</p>;
  }

  return (
    <ul className="space-y-3">
      {data.map((d, i) => {
        const pct = total > 0 ? (d.total / total) * 100 : 0;
        return (
          <li key={d.method}>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {PAYMENT_METHOD_LABELS[d.method]} · {d.count} order{d.count === 1 ? "" : "s"}
              </span>
              <span className="font-medium tabular-nums">{formatMoney(d.total, currency)}</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <motion.div
                className={`h-full rounded-full ${BAR_CLASS[i % BAR_CLASS.length]}`}
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
