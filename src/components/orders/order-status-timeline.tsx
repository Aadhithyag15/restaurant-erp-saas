import { CheckCircle2, Circle } from "lucide-react";
import { ORDER_STATUSES, ORDER_STATUS_LABELS } from "@/lib/orders";
import { cn } from "@/lib/utils";
import type { OrderStatus } from "@/types/database";

/**
 * Lifecycle stepper: pending -> preparing -> ready -> served (forward-only,
 * see order_status_rank in supabase/migrations/0005_orders.sql). Only the
 * "placed" and "current" steps have timestamps — intermediate steps that were
 * skipped quickly don't carry their own history row.
 */
export function OrderStatusTimeline({
  status,
  createdAt,
  statusUpdatedAt,
  timeZone,
}: {
  status: OrderStatus;
  createdAt: string;
  statusUpdatedAt: string;
  timeZone: string;
}) {
  const currentIndex = ORDER_STATUSES.indexOf(status);

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleString("en-IN", { timeZone, dateStyle: "medium", timeStyle: "short" });

  return (
    <ol className="flex flex-col gap-4 sm:flex-row sm:gap-0">
      {ORDER_STATUSES.map((step, index) => {
        const done = index <= currentIndex;
        const isCurrent = index === currentIndex;
        const timestamp = index === 0 ? createdAt : isCurrent ? statusUpdatedAt : null;

        return (
          <li key={step} className="flex flex-1 items-start gap-3 sm:flex-col sm:items-center sm:gap-2 sm:text-center">
            <div className="flex items-center sm:w-full">
              <div className={cn("h-px flex-1 sm:block", index === 0 ? "hidden sm:invisible" : "bg-border")} />
              {done ? (
                <CheckCircle2 className={cn("size-5 shrink-0", isCurrent ? "text-primary" : "text-success")} aria-hidden />
              ) : (
                <Circle className="size-5 shrink-0 text-muted-foreground" aria-hidden />
              )}
              <div className={cn("h-px flex-1 sm:block", index === ORDER_STATUSES.length - 1 ? "hidden sm:invisible" : "bg-border")} />
            </div>
            <div>
              <p className={cn("text-sm font-medium", !done && "text-muted-foreground")}>{ORDER_STATUS_LABELS[step]}</p>
              {timestamp ? <p className="text-xs text-muted-foreground">{formatTime(timestamp)}</p> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
