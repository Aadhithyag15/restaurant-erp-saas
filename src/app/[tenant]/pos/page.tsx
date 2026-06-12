import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BookOpen, ShoppingCart } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "POS" };

/**
 * POS shell (Milestone 1): responsive two-panel layout — menu area + cart.
 * Menu grid and cart logic land in Milestones 4–5; this fixes the layout and
 * routing contract. Kitchen role has no business here.
 */
export default async function PosPage({ params }: { params: Promise<{ tenant: string }> }) {
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
  if (membership?.role === "kitchen") redirect(`/${slug}/dashboard`);

  return (
    <div className="flex min-h-[70dvh] flex-col gap-4 lg:flex-row">
      {/* Menu panel */}
      <section className="flex min-w-0 flex-1 flex-col gap-4">
        <h1 className="sr-only">POS</h1>
        <Card className="flex flex-1 flex-col items-center justify-center py-16 text-center">
          <CardHeader>
            <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-secondary">
              <BookOpen className="size-5" aria-hidden />
            </div>
            <CardTitle>No menu yet</CardTitle>
            <CardDescription>
              Add categories and items in the{" "}
              <Link href={`/${slug}/menu`} className="underline underline-offset-4">
                Menu manager
              </Link>{" "}
              — they appear here instantly.
            </CardDescription>
          </CardHeader>
        </Card>
      </section>

      {/* Cart panel — right column on desktop, stacked below on tablet/mobile */}
      <aside className="lg:w-80 lg:shrink-0">
        <Card className="lg:sticky lg:top-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShoppingCart className="size-4" aria-hidden />
              Cart
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Tap menu items to start a bill.</p>
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}
