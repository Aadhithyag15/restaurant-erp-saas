import { notFound, redirect } from "next/navigation";
import { InvitationsList, type PendingInvitation } from "@/components/staff/invitations-list";
import { InviteForm } from "@/components/staff/invite-form";
import { StaffRoster, type RosterMember } from "@/components/staff/staff-roster";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { siteOrigin } from "@/lib/site";
import type { MemberRole } from "@/types/database";

export const metadata = { title: "Staff" };

const STAFF_PAGE_ROLES: MemberRole[] = ["owner", "admin"];

export default async function StaffPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: slug } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: tenant } = await supabase.from("tenants").select("id, name").eq("slug", slug).maybeSingle();
  if (!tenant) notFound();

  const { data: membership } = await supabase
    .from("memberships")
    .select("role")
    .eq("tenant_id", tenant.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership || !STAFF_PAGE_ROLES.includes(membership.role)) {
    redirect(`/${slug}/dashboard`);
  }

  const [{ data: members }, { data: invitations }] = await Promise.all([
    supabase
      .from("memberships")
      .select("id, user_id, role, is_active, created_at")
      .eq("tenant_id", tenant.id)
      .order("created_at"),
    supabase
      .from("invitations")
      .select("id, email, role, token, expires_at, created_at")
      .eq("tenant_id", tenant.id)
      .is("accepted_at", null)
      .order("created_at", { ascending: false }),
  ]);

  const userIds = (members ?? []).map((m) => m.user_id);
  const { data: profiles } = userIds.length
    ? await supabase.from("profiles").select("id, full_name, email").in("id", userIds)
    : { data: [] as { id: string; full_name: string; email: string }[] };
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

  const roster: RosterMember[] = (members ?? []).map((m) => ({
    id: m.id,
    role: m.role,
    isActive: m.is_active,
    fullName: profileById.get(m.user_id)?.full_name ?? "",
    email: profileById.get(m.user_id)?.email ?? "",
    isSelf: m.user_id === user.id,
  }));

  const pending: PendingInvitation[] = invitations ?? [];
  const origin = await siteOrigin();

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Staff</h1>
        <p className="text-sm text-muted-foreground">Invite team members and manage who has access to {tenant.name}.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Invite staff</CardTitle>
          <CardDescription>They&apos;ll get a link to join with the role you choose.</CardDescription>
        </CardHeader>
        <CardContent>
          <InviteForm tenantId={tenant.id} slug={slug} />
        </CardContent>
      </Card>

      {pending.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Pending invitations</CardTitle>
            <CardDescription>Copy the link to share it directly, resend to extend it, or revoke it.</CardDescription>
          </CardHeader>
          <CardContent>
            <InvitationsList tenantId={tenant.id} slug={slug} invitations={pending} origin={origin} />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Team</CardTitle>
          <CardDescription>Everyone with access to this restaurant.</CardDescription>
        </CardHeader>
        <CardContent>
          <StaffRoster tenantId={tenant.id} slug={slug} members={roster} viewerRole={membership.role} />
        </CardContent>
      </Card>
    </div>
  );
}
