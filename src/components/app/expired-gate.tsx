"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { MemberRole } from "@/types/database";

/**
 * UI companion to the database license gate: when the subscription lapses,
 * RLS already blocks every write — this wall just explains that, while still
 * letting owners reach Billing and Settings. Data export stays available by
 * design (their data remains theirs).
 */
const ALLOWED_SEGMENTS = ["billing", "settings"];

export function ExpiredGate({
  expired,
  slug,
  role,
  children,
}: {
  expired: boolean;
  slug: string;
  role: MemberRole;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const segment = pathname.split("/")[2] ?? "";

  if (!expired || ALLOWED_SEGMENTS.includes(segment)) return <>{children}</>;

  const canBill = role === "owner" || role === "admin";

  return (
    <div className="flex justify-center pt-12">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-secondary">
            <Lock className="size-5" aria-hidden />
          </div>
          <CardTitle>Your trial has ended</CardTitle>
          <CardDescription>
            Your data is safe and stays exportable, but new orders and edits are paused until a plan
            is active.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {canBill ? (
            <Button asChild>
              <Link href={`/${slug}/billing`}>View plans</Link>
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">Ask the restaurant owner to activate a plan.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
