import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Post-auth resolver: lands the user in the right place without the
 * middleware ever querying the database. First active membership wins;
 * none means the user still needs to create their restaurant.
 */
export default async function GoPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("memberships")
    .select("tenant_id")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!membership) redirect("/onboarding");

  const { data: tenant } = await supabase
    .from("tenants")
    .select("slug")
    .eq("id", membership.tenant_id)
    .maybeSingle();

  if (!tenant) redirect("/onboarding");
  redirect(`/${tenant.slug}/dashboard`);
}
