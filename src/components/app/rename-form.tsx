"use client";

import * as React from "react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateTenantName, type ActionState } from "@/lib/actions/tenant";

export function RenameForm({ tenantId, currentName }: { tenantId: string; currentName: string }) {
  const action = updateTenantName.bind(null, tenantId);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, null);

  return (
    <form action={formAction} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      {state?.error ? (
        <p role="alert" className="text-sm text-destructive sm:order-last sm:self-center">
          {state.error}
        </p>
      ) : null}
      <div className="grid flex-1 gap-2">
        <Label htmlFor="name">Restaurant name</Label>
        <Input id="name" name="name" defaultValue={currentName} minLength={2} required />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
