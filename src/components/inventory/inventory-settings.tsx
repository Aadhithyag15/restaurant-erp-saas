"use client";

import * as React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { setAllowNegativeStock } from "@/lib/actions/inventory";

export function InventorySettings({ tenantId, slug, allowNegativeStock }: { tenantId: string; slug: string; allowNegativeStock: boolean }) {
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const onChange = async (checked: boolean) => {
    setError(null);
    setPending(true);
    try {
      const result = await setAllowNegativeStock(tenantId, slug, checked);
      if (result?.error) setError(result.error);
    } finally {
      setPending(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Settings</CardTitle>
        <CardDescription>Owner/admin only.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <label className="flex items-center justify-between gap-4 rounded-lg border bg-secondary/20 p-3 transition-colors hover:bg-accent/50">
          <span className="flex flex-col gap-0.5">
            <span className="text-sm font-medium">Allow stock to go negative</span>
            <span className="text-xs text-muted-foreground">
              When off (default), placing a POS order that would deplete an ingredient below zero is rejected.
            </span>
          </span>
          <span className="relative inline-flex shrink-0 items-center">
            <input
              type="checkbox"
              defaultChecked={allowNegativeStock}
              disabled={pending}
              onChange={(e) => onChange(e.target.checked)}
              className="peer sr-only"
            />
            <span className="h-6 w-10 rounded-full bg-input transition-colors peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-disabled:opacity-50" />
            <span className="pointer-events-none absolute left-0.5 size-5 rounded-full bg-background shadow-[var(--shadow-sm)] transition-transform peer-checked:translate-x-4" />
          </span>
        </label>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
