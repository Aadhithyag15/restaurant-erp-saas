"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { acceptInvitation, type AcceptState } from "@/lib/actions/staff";

export function AcceptInviteForm({ token }: { token: string }) {
  const action = acceptInvitation.bind(null, token);
  const [state, formAction, pending] = useActionState<AcceptState, FormData>(action, null);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      {state?.error ? (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Joining…" : "Accept invitation"}
      </Button>
    </form>
  );
}
