"use client";

import { useLocale } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { formatMoney } from "@/lib/utils";

export interface AnimatedMoneyProps {
  cents: number;
  alwaysCents?: boolean;
  className?: string;
}

/** Counts from the previous amount to the new one. The first render shows the value as is. */
export function AnimatedMoney({ cents, alwaysCents = false, className }: AnimatedMoneyProps) {
  const locale = useLocale();
  const [shown, setShown] = useState(cents);
  const fromRef = useRef(cents);

  useEffect(() => {
    const from = fromRef.current;
    if (from === cents) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      fromRef.current = cents;
      setShown(cents);
      return;
    }
    const duration = 600;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const value = Math.round(from + (cents - from) * eased);
      fromRef.current = value;
      setShown(value);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [cents]);

  return (
    <span className={className} style={{ fontVariantNumeric: "tabular-nums" }}>
      {formatMoney(shown, { alwaysCents, locale })}
    </span>
  );
}
