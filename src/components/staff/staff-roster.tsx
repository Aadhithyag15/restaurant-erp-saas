"use client";

import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { removeMembership, setMembershipActive } from "@/lib/actions/staff";
import { ROLE_LABELS } from "@/lib/staff";
import type { MemberRole } from "@/types/database";

export type RosterMember = {
  id: string;
  role: MemberRole;
  isActive: boolean;
  fullName: string;
  email: string;
  isSelf: boolean;
};

export function StaffRoster({
  tenantId,
  slug,
  members,
  viewerRole,
}: {
  tenantId: string;
  slug: string;
  members: RosterMember[];
  viewerRole: MemberRole;
}) {
  const canManage = viewerRole === "owner" || viewerRole === "admin";
  const canRemove = viewerRole === "owner";

  return (
    <ul className="divide-y">
      {members.map((m) => {
        // Owner rows can only be managed by an owner; nobody can act on their own row
        // (mirrors the memberships_update / memberships_delete RLS guards).
        const escalationLocked = m.role === "owner" && viewerRole !== "owner";
        const canToggle = canManage && !m.isSelf && !escalationLocked;
        const canDelete = canRemove && !m.isSelf && !escalationLocked;
        const toggleAction = setMembershipActive.bind(null, tenantId, slug, m.id, !m.isActive);
        const removeAction = removeMembership.bind(null, tenantId, slug, m.id);
        const displayName = m.fullName || m.email || "Unnamed";

        return (
          <li key={m.id} className="flex items-center justify-between gap-2 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                {displayName} {m.isSelf ? <span className="text-muted-foreground">(you)</span> : null}
              </p>
              <p className="truncate text-xs text-muted-foreground">{m.email}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="rounded-full border px-2 py-0.5 text-xs uppercase tracking-wide text-muted-foreground">
                {ROLE_LABELS[m.role]}
              </span>
              {!m.isActive ? (
                <span className="rounded-full border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-xs text-destructive">
                  Disabled
                </span>
              ) : null}
              {canToggle ? (
                <form action={toggleAction}>
                  <Button type="submit" variant="ghost" size="sm">
                    {m.isActive ? "Disable" : "Enable"}
                  </Button>
                </form>
              ) : null}
              {canDelete ? (
                <form
                  action={removeAction}
                  onSubmit={(e) => {
                    if (!window.confirm(`Remove ${displayName} from the team? This cannot be undone.`)) e.preventDefault();
                  }}
                >
                  <Button
                    type="submit"
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive"
                    aria-label={`Remove ${displayName}`}
                    title="Remove from team"
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </form>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
