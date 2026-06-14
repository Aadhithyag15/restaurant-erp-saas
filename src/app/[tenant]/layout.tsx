import { notFound, redirect } from "next/navigation";
import { ExpiredGate } from "@/components/app/expired-gate";
import { Sidebar } from "@/components/app/sidebar";
import { TrialBanner } from "@/components/app/trial-banner";
import { deriveLicense } from "@/lib/license";
import { createClient } from "@/lib/supabase/server";

/**
 * The real protection layer. Middleware only checked "has a session";
 * here we verify, against RLS-guarded tables:
 *   1. the tenant exists AND the user is a member (RLS hides foreign tenants,
 *      so both failures look identical: 404 — no tenant enumeration)
 *   2. the membership is active (disabled staff are locked out)
 *   3. the license state (expired tenants get a read-only wall)
 */
export default async function TenantLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tenant: string }>;
}) {

  const { tenant: slug } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect(`/login?next=/${slug}/dashboard`);

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, name, slug, currency, timezone")
    .eq("slug", slug)
    .maybeSingle();

  

  if (!tenant) notFound();

  const [{ data: membership }, { data: subscription }] = await Promise.all([
    supabase
      .from("memberships")
      .select("role, is_active")
      .eq("tenant_id", tenant.id)
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("subscriptions")
      .select("status, trial_ends_at, current_period_end")
      .eq("tenant_id", tenant.id)
      .maybeSingle(),
  ]);

  
  if (!membership?.is_active) notFound();

  const license = deriveLicense(subscription);

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <Sidebar slug={tenant.slug} tenantName={tenant.name} role={membership.role} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TrialBanner license={license} slug={tenant.slug} role={membership.role} />
        <main className="flex-1 p-4 print:p-0 md:p-8">
          <ExpiredGate expired={!license.isActive} slug={tenant.slug} role={membership.role}>
            {children}
          </ExpiredGate>
        </main>
      </div>
    </div>
  );
}
