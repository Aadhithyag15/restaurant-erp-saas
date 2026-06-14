import Link from "next/link";
import { Clock } from "lucide-react";
import type { License } from "@/lib/license";
import { cn } from "@/lib/utils";
import type { MemberRole } from "@/types/database";

export function TrialBanner({ license, slug, role }: { license: License; slug: string; role: MemberRole }) {
  if (license.state !== "trialing") return null;

  const urgent = (license.daysLeft ?? 0) <= 4;
  const canBill = role === "owner" || role === "admin";

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-center gap-x-2 gap-y-1 border-b px-4 py-2 text-center text-sm print:hidden",
        urgent ? "bg-destructive/10 text-destructive" : "bg-secondary text-secondary-foreground",
      )}
    >
      <Clock className="size-4 shrink-0" aria-hidden />
      <span>
        Free trial — {license.daysLeft} {license.daysLeft === 1 ? "day" : "days"} left.
      </span>
      {canBill ? (
        <Link href={`/${slug}/billing`} className="font-medium underline underline-offset-4">
          Choose a plan
        </Link>
      ) : null}
    </div>
  );
}
