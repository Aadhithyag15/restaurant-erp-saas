"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { normalizeEmail, validateInviteEmail, validateInviteRole } from "@/lib/staff";

/**
 * Staff invitation + roster server actions. Authorization is NOT decided
 * here — RLS enforces role (owner/admin) and the self-modification guards on
 * every statement (see migration 0008); these actions just validate input and
 * translate database errors for humans.
 */

export type StaffActionState = { error: string } | null;

const UNIQUE_VIOLATION = "23505";
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function newExpiry(): string {
  return new Date(Date.now() + INVITE_TTL_MS).toISOString();
}

/**
 * Sends (or refreshes) an invitation. A pending invite for the same email is
 * reused — its token and role are refreshed and its expiry pushed out 7 days —
 * rather than creating a duplicate row (the partial unique index on
 * (tenant_id, lower(email)) where accepted_at is null backs this up).
 */
export async function inviteStaff(tenantId: string, slug: string, _prev: StaffActionState, formData: FormData): Promise<StaffActionState> {
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const emailError = validateInviteEmail(email);
  if (emailError) return { error: emailError };

  const role = validateInviteRole(String(formData.get("role") ?? ""));
  if (!role) return { error: "Choose a role." };

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("invitations")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("email", email)
    .is("accepted_at", null)
    .maybeSingle();

  const { error } = existing
    ? await supabase
        .from("invitations")
        .update({ role, token: crypto.randomUUID(), expires_at: newExpiry() })
        .eq("id", existing.id)
    : await supabase.from("invitations").insert({ tenant_id: tenantId, email, role });

  if (error) {
    if (error.code === UNIQUE_VIOLATION) return { error: "An invitation to this email is already pending." };
    return { error: "Could not send the invitation — check your permissions and license." };
  }

  revalidatePath(`/${slug}/staff`);
  return null;
}

/** Issues a fresh token and a new 7-day expiry for a pending invitation. */
export async function resendInvitation(tenantId: string, slug: string, invitationId: string): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from("invitations")
    .update({ token: crypto.randomUUID(), expires_at: newExpiry() })
    .eq("id", invitationId)
    .eq("tenant_id", tenantId)
    .is("accepted_at", null);
  revalidatePath(`/${slug}/staff`);
}

/** Permanently withdraws a pending invitation. */
export async function revokeInvitation(tenantId: string, slug: string, invitationId: string): Promise<void> {
  const supabase = await createClient();
  await supabase.from("invitations").delete().eq("id", invitationId).eq("tenant_id", tenantId);
  revalidatePath(`/${slug}/staff`);
}

/** Enables or disables a staff member without deleting their history. */
export async function setMembershipActive(tenantId: string, slug: string, membershipId: string, isActive: boolean): Promise<void> {
  const supabase = await createClient();
  await supabase.from("memberships").update({ is_active: isActive }).eq("id", membershipId).eq("tenant_id", tenantId);
  revalidatePath(`/${slug}/staff`);
}

/** Removes a staff member's access entirely. RLS reserves this for owners. */
export async function removeMembership(tenantId: string, slug: string, membershipId: string): Promise<void> {
  const supabase = await createClient();
  await supabase.from("memberships").delete().eq("id", membershipId).eq("tenant_id", tenantId);
  revalidatePath(`/${slug}/staff`);
}

export type AcceptState = { error: string } | null;

/** Joins the inviting tenant via the accept_invitation RPC, then lands on its dashboard. */
export async function acceptInvitation(token: string, _prev: AcceptState, _formData: FormData): Promise<AcceptState> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("accept_invitation", { p_token: token });
  if (error) return { error: error.message };

  const { data: tenant } = await supabase.from("tenants").select("slug").eq("id", data).maybeSingle();

  revalidatePath("/", "layout");
  redirect(tenant ? `/${tenant.slug}/dashboard` : "/go");
}
