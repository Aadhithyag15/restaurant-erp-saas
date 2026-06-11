import Link from "next/link";
import { UtensilsCrossed } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Minimal public landing — real marketing content arrives near launch. */
export default function LandingPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-2 font-semibold">
          <UtensilsCrossed className="size-5" aria-hidden />
          Restaurant ERP
        </div>
        <nav className="flex items-center gap-2">
          <Button variant="ghost" asChild>
            <Link href="/login">Sign in</Link>
          </Button>
          <Button asChild>
            <Link href="/signup">Start free trial</Link>
          </Button>
        </nav>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-16 text-center">
        <h1 className="max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl">
          Run your restaurant from one screen
        </h1>
        <p className="max-w-xl text-lg text-muted-foreground">
          POS, kitchen tickets, inventory and accounting — multi-device, export-ready, and yours in
          minutes. Free for 14 days, no card required.
        </p>
        <Button size="lg" asChild>
          <Link href="/signup">Start your 14-day free trial</Link>
        </Button>
      </main>

      <footer className="border-t px-6 py-4 text-center text-sm text-muted-foreground">
        Works on desktop, tablet and mobile.
      </footer>
    </div>
  );
}
