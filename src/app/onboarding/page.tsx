import { redirect } from "next/navigation";
import { UtensilsCrossed } from "lucide-react";
import { OnboardingForm } from "@/components/onboarding/onboarding-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Create your restaurant" };

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Already onboarded? Straight to the workspace.
  const { data: membership } = await supabase
    .from("memberships")
    .select("tenant_id")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  if (membership) redirect("/go");

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-secondary/50 px-4 py-10">
      <div className="flex items-center gap-2 font-semibold">
        <UtensilsCrossed className="size-5" aria-hidden />
        Restaurant ERP
      </div>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Create your restaurant</CardTitle>
          <CardDescription>
            This activates your 14-day free trial — full access, no card required.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OnboardingForm />
        </CardContent>
      </Card>
    </div>
  );
}
