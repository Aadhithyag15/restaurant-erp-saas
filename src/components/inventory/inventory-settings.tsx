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
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            defaultChecked={allowNegativeStock}
            disabled={pending}
            onChange={(e) => onChange(e.target.checked)}
            className="mt-0.5 size-4 accent-primary"
          />
          <span>
            Allow stock to go negative
            <span className="block text-xs text-muted-foreground">
              When off (default), placing a POS order that would deplete an ingredient below zero is rejected.
            </span>
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
