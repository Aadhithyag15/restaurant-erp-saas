import Link from "next/link";
import { UtensilsCrossed } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function AuthShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-secondary/50 px-4 py-10">
      <Link href="/" className="flex items-center gap-2 font-semibold">
        <UtensilsCrossed className="size-5" aria-hidden />
        Restaurant ERP
      </Link>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </div>
  );
}

/** Renders the error/message passed back by server actions via searchParams. */
export function FormNotice({ error, message }: { error?: string; message?: string }) {
  if (error) {
    return (
      <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
        {error}
      </p>
    );
  }
  if (message) {
    return <p className="rounded-md border bg-secondary px-3 py-2 text-sm text-secondary-foreground">{message}</p>;
  }
  return null;
}
