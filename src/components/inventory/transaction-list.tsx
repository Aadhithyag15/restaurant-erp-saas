import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { INVENTORY_UNIT_LABELS, TRANSACTION_TYPE_BADGE_VARIANT, TRANSACTION_TYPE_LABELS, type InventoryUnit } from "@/lib/inventory";
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
          <ul className="flex flex-col">
            {transactions.map((t, i) => {
              const unitLabel = t.ingredient ? (INVENTORY_UNIT_LABELS[t.ingredient.unit as InventoryUnit] ?? t.ingredient.unit) : "";
              return (
                <React.Fragment key={t.id}>
                  {i > 0 ? <Separator /> : null}
                  <li className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg px-2 py-2.5 transition-colors hover:bg-accent/50">
                    <div className="min-w-0 flex-1 basis-48">
                      <p className="truncate text-sm font-medium">{t.ingredient?.name ?? "Deleted ingredient"}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {formatWhen(t.created_at)}
                        {t.notes ? ` · ${t.notes}` : ""}
                      </p>
                    </div>
                    <Badge variant={TRANSACTION_TYPE_BADGE_VARIANT[t.type]}>{TRANSACTION_TYPE_LABELS[t.type]}</Badge>
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
                </React.Fragment>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
