"use client";

import * as React from "react";
import { animate, useMotionValue, useReducedMotion } from "framer-motion";

const defaultFormat = (value: number) => Math.round(value).toLocaleString("en-IN");

/** Counts up from 0 to `value` on mount/change. Skips the animation entirely under reduced motion. */
export function AnimatedCounter({
  value,
  format = defaultFormat,
  duration = 0.9,
  className,
}: {
  value: number;
  format?: (value: number) => string;
  duration?: number;
  className?: string;
}) {
  const prefersReducedMotion = useReducedMotion();
  const motionValue = useMotionValue(prefersReducedMotion ? value : 0);
  const [display, setDisplay] = React.useState(() => format(prefersReducedMotion ? value : 0));

  React.useEffect(() => {
    if (prefersReducedMotion) {
      setDisplay(format(value));
      return;
    }
    const controls = animate(motionValue, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (latest) => setDisplay(format(latest)),
    });
    return () => controls.stop();
  }, [value, duration, format, motionValue, prefersReducedMotion]);

  return <span className={className}>{display}</span>;
}
