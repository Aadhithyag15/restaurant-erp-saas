"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FadeIn } from "@/components/motion/fade-in";
import { AnimatedCounter } from "@/components/motion/animated-counter";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

const TONE_CLASSES = {
  primary: "bg-primary/10 text-primary",
  success: "bg-success/15 text-success",
  warning: "bg-warning/15 text-warning",
  muted: "bg-muted text-muted-foreground",
} as const;

export function StatCard({
  icon,
  label,
  value,
  currency,
  description,
  tone = "muted",
  delay = 0,
}: {
  icon?: React.ReactNode;
  label: string;
  value: number;
  currency?: string;
  description?: React.ReactNode;
  tone?: keyof typeof TONE_CLASSES;
  delay?: number;
}) {
  const format = currency ? (v: number) => formatMoney(v, currency) : undefined;

  return (
    <FadeIn delay={delay}>
      <Card className="h-full">
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
          {icon ? (
            <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full", TONE_CLASSES[tone])}>
              {icon}
            </span>
          ) : null}
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-semibold tracking-tight tabular-nums">
            <AnimatedCounter value={value} format={format} />
          </div>
          {description ? <p className="mt-1 text-xs text-muted-foreground">{description}</p> : null}
        </CardContent>
      </Card>
    </FadeIn>
  );
}
