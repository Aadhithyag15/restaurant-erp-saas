"use client";

import * as React from "react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { inviteStaff, type StaffActionState } from "@/lib/actions/staff";
import { INVITABLE_ROLES, ROLE_LABELS } from "@/lib/staff";

export function InviteForm({ tenantId, slug }: { tenantId: string; slug: string }) {
  const action = inviteStaff.bind(null, tenantId, slug);
  const [state, formAction, pending] = useActionState<StaffActionState, FormData>(action, null);
  const formRef = React.useRef<HTMLFormElement>(null);

  React.useEffect(() => {
    if (state === null) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4 rounded-lg border bg-secondary/20 p-4 sm:flex-row sm:items-end sm:gap-3">
      {state?.error ? (
        <p role="alert" className="text-sm text-destructive sm:order-last sm:basis-full">
          {state.error}
        </p>
      ) : null}
      <div className="grid flex-1 gap-2">
        <Label htmlFor="invite-email">Email</Label>
        <Input id="invite-email" name="email" type="email" placeholder="staff@example.com" autoComplete="off" required />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="invite-role">Role</Label>
        <select
          id="invite-role"
          name="role"
          defaultValue="cashier"
          className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {INVITABLE_ROLES.map((role) => (
            <option key={role} value={role}>
              {ROLE_LABELS[role]}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Sending…" : "Send invite"}
      </Button>
    </form>
  );
}
