import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">Page not found</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        This page doesn&apos;t exist, or you don&apos;t have access to this restaurant.
      </p>
      <Button asChild>
        <Link href="/go">Go to my restaurant</Link>
      </Button>
    </div>
  );
}
