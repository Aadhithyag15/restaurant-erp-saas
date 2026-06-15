"use client";

import * as React from "react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { recordDailyClosing, type AccountingActionState } from "@/lib/actions/accounting";

const TEXTAREA_CLASS =
  "flex min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

export function DailyClosingForm({
  tenantId,
  slug,
  closingDate,
  initial,
}: {
  tenantId: string;
  slug: string;
  closingDate: string;
  initial: { openingCash: number; closingCash: number; cashRefunds: number; notes: string | null } | null;
}) {
  const action = recordDailyClosing.bind(null, tenantId, slug, closingDate);
  const [state, formAction, pending] = useActionState<AccountingActionState, FormData>(action, null);
  const [savedAt, setSavedAt] = React.useState<number | null>(null);
  const prevPending = React.useRef(pending);

  React.useEffect(() => {
    if (prevPending.current && !pending && !state?.error) setSavedAt(Date.now());
    prevPending.current = pending;
  }, [pending, state]);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="opening_cash">Opening cash</Label>
          <Input
            id="opening_cash"
            name="opening_cash"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            defaultValue={initial?.openingCash ?? 0}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="closing_cash">Closing cash</Label>
          <Input
            id="closing_cash"
            name="closing_cash"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            defaultValue={initial?.closingCash ?? 0}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cash_refunds">Cash refunds</Label>
          <Input
            id="cash_refunds"
            name="cash_refunds"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            defaultValue={initial?.cashRefunds ?? 0}
            required
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="notes">Notes</Label>
        <textarea id="notes" name="notes" maxLength={500} defaultValue={initial?.notes ?? ""} className={TEXTAREA_CLASS} />
      </div>

      {state?.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending} className="self-start">
          {pending ? "Saving…" : "Save closing"}
        </Button>
        {savedAt && !pending ? <span className="text-sm text-muted-foreground">Saved.</span> : null}
      </div>
    </form>
  );
}
