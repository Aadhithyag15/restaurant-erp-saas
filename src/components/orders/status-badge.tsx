import { ORDER_STATUS_BADGE_CLASS, ORDER_STATUS_LABELS } from "@/lib/orders";
import { cn } from "@/lib/utils";
import type { OrderStatus } from "@/types/database";

export function StatusBadge({ status, className }: { status: OrderStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium uppercase tracking-wide",
        ORDER_STATUS_BADGE_CLASS[status],
        className,
      )}
    >
      {ORDER_STATUS_LABELS[status]}
    </span>
  );
}
