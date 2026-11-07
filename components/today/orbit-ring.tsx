"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export interface OrbitRingProps {
  /** Share of today's pace still available, 0 to 1. */
  progress: number;
  tone?: "brand" | "short";
  children: React.ReactNode;
  className?: string;
}

const TONE_COLOR = {
  brand: "var(--orbit-brand)",
  short: "var(--orbit-short)",
} as const;

/** The day as an orbit: the arc is what is left, the satellite rides its end. */
export function OrbitRing({ progress, tone = "brand", children, className }: OrbitRingProps) {
  const target = Math.min(1, Math.max(0, progress));
  const [value, setValue] = useState(0);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setValue(target));
    return () => cancelAnimationFrame(frame);
  }, [target]);

  const color = TONE_COLOR[tone];
  const transition = "all 1100ms cubic-bezier(0.2, 0.9, 0.2, 1)";

  return (
    <div className={cn("relative mx-auto aspect-square w-full max-w-[19rem]", className)}>
      <svg viewBox="0 0 100 100" className="absolute inset-0 size-full overflow-visible" aria-hidden="true">
        <defs>
          <filter id="orbit-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" />
          </filter>
        </defs>
        <circle cx="50" cy="50" r="46" fill="none" stroke="var(--orbit-line)" strokeWidth="1.5" />
        <circle
          cx="50"
          cy="50"
          r="46"
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray="1 1"
          strokeDashoffset={1 - value}
          transform="rotate(-90 50 50)"
          style={{ transition }}
        />
        <g style={{ transform: `rotate(${value * 360}deg)`, transformOrigin: "50px 50px", transition }}>
          <circle cx="50" cy="4" r="6" fill={color} opacity="0.35" filter="url(#orbit-glow)" />
          <circle cx="50" cy="4" r="3.6" fill={color} />
          <circle cx="50" cy="4" r="1.3" fill="var(--orbit-surface)" />
        </g>
      </svg>
      <div className="absolute inset-[12%] flex flex-col items-center justify-center text-center">
        {children}
      </div>
    </div>
  );
}
