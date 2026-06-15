"use client";

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { formatMoney } from "@/lib/money";

const CHART_WIDTH = 300;
const CHART_HEIGHT = 100;
const PADDING = 8;

export function RevenueTrendChart({
  data,
  currency,
  ariaLabel = "Revenue over the last 7 days",
}: {
  data: { label: string; value: number }[];
  currency: string;
  ariaLabel?: string;
}) {
  const prefersReducedMotion = useReducedMotion();
  const max = Math.max(1, ...data.map((d) => d.value));
  const stepX = data.length > 1 ? (CHART_WIDTH - PADDING * 2) / (data.length - 1) : 0;
  const labelStep = Math.max(1, Math.ceil(data.length / 8));

  const points = data.map((d, i) => {
    const x = PADDING + i * stepX;
    const y = PADDING + (1 - d.value / max) * (CHART_HEIGHT - PADDING * 2);
    return { ...d, x, y };
  });

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const areaPath = `${linePath} L${points[points.length - 1]?.x ?? PADDING},${CHART_HEIGHT - PADDING} L${points[0]?.x ?? PADDING},${CHART_HEIGHT - PADDING} Z`;

  return (
    <div>
      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        className="h-32 w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label={ariaLabel}
      >
        <defs>
          <linearGradient id="revenue-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.25} />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <motion.path
          d={areaPath}
          fill="url(#revenue-gradient)"
          stroke="none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.6, delay: prefersReducedMotion ? 0 : 0.4 }}
        />
        <motion.path
          d={linePath}
          fill="none"
          stroke="var(--primary)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: prefersReducedMotion ? 0 : 1.1, ease: [0.16, 1, 0.3, 1] }}
        />
        {points.map((p, i) => (
          <motion.circle
            key={p.label}
            cx={p.x}
            cy={p.y}
            r={2.5}
            fill="var(--primary)"
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.25, delay: prefersReducedMotion ? 0 : 0.6 + i * 0.06 }}
          >
            <title>{`${p.label}: ${formatMoney(p.value, currency)}`}</title>
          </motion.circle>
        ))}
      </svg>
      <div className="mt-2 flex justify-between text-xs text-muted-foreground">
        {points.map((p, i) => (
          <span key={`${p.label}-${i}`}>{i % labelStep === 0 || i === points.length - 1 ? p.label : ""}</span>
        ))}
      </div>
    </div>
  );
}
