/**
 * Pure validation/labels for staff invitations and the roster. Server actions
 * call these before touching the database; RLS and table constraints (e.g.
 * `invitations.role <> 'owner'`) remain the final authority.
 */
import type { MemberRole } from "@/types/database";

export const INVITABLE_ROLES: MemberRole[] = ["admin", "manager", "cashier", "kitchen"];

export const ROLE_LABELS: Record<MemberRole, string> = {
  owner: "Owner",
  admin: "Admin",
  manager: "Manager",
  cashier: "Cashier",
  kitchen: "Kitchen",
};

const EMAIL_REGEX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Returns an error message, or null when the email is acceptable. */
export function validateInviteEmail(email: string): string | null {
  if (!EMAIL_REGEX.test(email) || email.length > 254) {
    return "Enter a valid email address.";
  }
  return null;
}

/** Returns the role if it's one staff can be invited as, otherwise null. */
export function validateInviteRole(role: string): MemberRole | null {
  return (INVITABLE_ROLES as string[]).includes(role) ? (role as MemberRole) : null;
}
