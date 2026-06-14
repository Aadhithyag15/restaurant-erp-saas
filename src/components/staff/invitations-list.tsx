"use client";

import * as React from "react";
import { Check, Copy, RotateCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { resendInvitation, revokeInvitation } from "@/lib/actions/staff";
import { ROLE_LABELS } from "@/lib/staff";
import type { MemberRole } from "@/types/database";

export type PendingInvitation = {
  id: string;
  email: string;
  role: MemberRole;
  token: string;
  expires_at: string;
};

function CopyLinkButton({ origin, token }: { origin: string; token: string }) {
  const [copied, setCopied] = React.useState(false);

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label="Copy invite link"
      title="Copy invite link"
      onClick={() => {
        navigator.clipboard.writeText(`${origin}/invite/${token}`).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
      }}
    >
      {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
    </Button>
  );
}

export function InvitationsList({
  tenantId,
  slug,
  invitations,
  origin,
}: {
  tenantId: string;
  slug: string;
  invitations: PendingInvitation[];
  origin: string;
}) {
  return (
    <ul className="divide-y">
      {invitations.map((inv) => {
        const expired = new Date(inv.expires_at).getTime() < Date.now();
        const resendAction = resendInvitation.bind(null, tenantId, slug, inv.id);
        const revokeAction = revokeInvitation.bind(null, tenantId, slug, inv.id);

        return (
          <li key={inv.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{inv.email}</p>
              <p className="text-xs text-muted-foreground">
                {ROLE_LABELS[inv.role]} ·{" "}
                {expired ? (
                  <span className="text-destructive">Expired</span>
                ) : (
                  `Expires ${new Date(inv.expires_at).toLocaleDateString()}`
                )}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <CopyLinkButton origin={origin} token={inv.token} />
              <form action={resendAction}>
                <Button type="submit" variant="ghost" size="icon" aria-label={`Resend invite to ${inv.email}`} title="Resend invite">
                  <RotateCw aria-hidden />
                </Button>
              </form>
              <form
                action={revokeAction}
                onSubmit={(e) => {
                  if (!window.confirm(`Revoke the invitation to ${inv.email}?`)) e.preventDefault();
                }}
              >
                <Button
                  type="submit"
                  variant="ghost"
                  size="icon"
                  className="text-destructive hover:text-destructive"
                  aria-label={`Revoke invite to ${inv.email}`}
                  title="Revoke invite"
                >
                  <X aria-hidden />
                </Button>
              </form>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
