import { notFound, redirect } from "next/navigation";
import { RenameForm } from "@/components/app/rename-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Settings" };

export default async function SettingsPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: slug } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, name, slug, currency, timezone")
    .eq("slug", slug)
    .maybeSingle();
  if (!tenant) notFound();

  const { data: membership } = await supabase
    .from("memberships")
    .select("role")
    .eq("tenant_id", tenant.id)
    .eq("user_id", user.id)
    .maybeSingle();
  const canEdit = membership?.role === "owner" || membership?.role === "admin";

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Restaurant profile and workspace details.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Restaurant</CardTitle>
          <CardDescription>
            Web address <span className="font-mono">/{tenant.slug}</span> · Currency {tenant.currency} · Timezone{" "}
            {tenant.timezone}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {canEdit ? (
            <RenameForm tenantId={tenant.id} currentName={tenant.name} />
          ) : (
            <p className="text-sm text-muted-foreground">Only owners and admins can edit these details.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Coming soon</CardTitle>
          <CardDescription>
            Staff invitations, the manager override code, and per-restaurant theming land alongside
            the POS phase, where they&apos;re first needed.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
