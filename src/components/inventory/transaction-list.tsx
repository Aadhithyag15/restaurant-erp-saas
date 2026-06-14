import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { INVENTORY_UNIT_LABELS, TRANSACTION_TYPE_BADGE_CLASS, TRANSACTION_TYPE_LABELS, type InventoryUnit } from "@/lib/inventory";
import { cn } from "@/lib/utils";
import type { InventoryTransactionType } from "@/types/database";

export type TransactionRow = {
  id: string;
  type: InventoryTransactionType;
  quantity_change: number;
  resulting_stock: number;
  notes: string | null;
  created_at: string;
  ingredient: { name: string; unit: string } | null;
};

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

export function TransactionList({ transactions }: { transactions: TransactionRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent transactions</CardTitle>
        <CardDescription>Every stock movement — purchases, waste, adjustments, corrections and POS sales — in one audit trail.</CardDescription>
      </CardHeader>
      <CardContent>
        {transactions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No stock movements recorded yet.</p>
        ) : (
          <ul className="divide-y">
            {transactions.map((t) => {
              const unitLabel = t.ingredient ? (INVENTORY_UNIT_LABELS[t.ingredient.unit as InventoryUnit] ?? t.ingredient.unit) : "";
              return (
                <li key={t.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5">
                  <div className="min-w-0 flex-1 basis-48">
                    <p className="truncate text-sm font-medium">{t.ingredient?.name ?? "Deleted ingredient"}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {formatWhen(t.created_at)}
                      {t.notes ? ` · ${t.notes}` : ""}
                    </p>
                  </div>
                  <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", TRANSACTION_TYPE_BADGE_CLASS[t.type])}>{TRANSACTION_TYPE_LABELS[t.type]}</span>
                  <div className="text-right text-sm tabular-nums">
                    <p className={cn("font-medium", t.quantity_change < 0 ? "text-destructive" : "text-success")}>
                      {t.quantity_change > 0 ? "+" : ""}
                      {t.quantity_change} {unitLabel}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      now {t.resulting_stock} {unitLabel}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
