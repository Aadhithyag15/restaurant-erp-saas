import Link from "next/link";
import { AcceptInviteForm } from "@/components/staff/accept-invite-form";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/actions/auth";
import { ROLE_LABELS } from "@/lib/staff";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Staff invitation" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_invitation_preview", { p_token: token });
  const invite = data?.[0];

  if (error || !invite) {
    return (
      <AuthShell title="Invitation not found" description="This invitation link is invalid.">
        <p className="text-sm text-muted-foreground">
          Double-check the link, or ask whoever invited you to send a new one.
        </p>
      </AuthShell>
    );
  }

  if (invite.is_accepted) {
    return (
      <AuthShell title="Already accepted" description={`This invitation to ${invite.tenant_name} has already been used.`}>
        <Button asChild className="w-full">
          <Link href="/go">Go to your workspace</Link>
        </Button>
      </AuthShell>
    );
  }

  if (invite.is_expired) {
    return (
      <AuthShell title="Invitation expired" description={`This invitation to ${invite.tenant_name} has expired.`}>
        <p className="text-sm text-muted-foreground">
          Ask an owner or admin at {invite.tenant_name} to send a new invitation.
        </p>
      </AuthShell>
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const next = `/invite/${token}`;

  if (!user) {
    return (
      <AuthShell
        title={`Join ${invite.tenant_name}`}
        description={`You've been invited as ${ROLE_LABELS[invite.role]}. Sign in or create an account with ${invite.email} to continue.`}
      >
        <div className="flex flex-col gap-3">
          <Button asChild className="w-full">
            <Link href={`/login?next=${encodeURIComponent(next)}`}>Sign in</Link>
          </Button>
          <Button asChild variant="outline" className="w-full">
            <Link href={`/signup?next=${encodeURIComponent(next)}`}>Create account</Link>
          </Button>
        </div>
      </AuthShell>
    );
  }

  if ((user.email ?? "").toLowerCase() !== invite.email.toLowerCase()) {
    return (
      <AuthShell title="Wrong account" description={`This invitation was sent to ${invite.email}, but you're signed in as ${user.email}.`}>
        <form action={signOut}>
          <Button type="submit" variant="outline" className="w-full">
            Sign out
          </Button>
        </form>
      </AuthShell>
    );
  }

  return (
    <AuthShell title={`Join ${invite.tenant_name}`} description={`You've been invited as ${ROLE_LABELS[invite.role]}.`}>
      <AcceptInviteForm token={token} />
    </AuthShell>
  );
}
