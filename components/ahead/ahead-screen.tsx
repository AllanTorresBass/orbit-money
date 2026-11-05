"use client";

import { useForecast } from "@/hooks/use-allowance";
import { cn, formatMoney, formatShortDate } from "@/lib/utils";

export interface AheadScreenProps {
  className?: string;
}

export function AheadScreen({ className }: AheadScreenProps) {
  const forecast = useForecast();

  if (forecast.isLoading) {
    return (
      <div className={cn("mx-auto max-w-md animate-pulse px-6 pt-8", className)}>
        <div className="h-8 w-32 rounded bg-[var(--orbit-line)]" />
        <div className="mt-10 h-40 w-full rounded bg-[var(--orbit-line)]" />
      </div>
    );
  }

  if (forecast.isError || !forecast.data) {
    return (
      <div className={cn("px-6 pt-10", className)}>
        <p className="text-[var(--orbit-short)]">Could not load ahead.</p>
      </div>
    );
  }

  const days = forecast.data.days;
  const maxBal = Math.max(...days.map((d) => d.balanceCents), 1);
  const minBal = Math.min(...days.map((d) => d.balanceCents), 0);
  const span = Math.max(maxBal - minBal, 1);

  const points = days
    .map((d, i) => {
      const x = (i / Math.max(days.length - 1, 1)) * 100;
      const y = 100 - ((d.balanceCents - minBal) / span) * 100;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className={cn("mx-auto min-h-screen max-w-md px-6 pb-28 pt-8", className)}>
      <h1 className="font-[family-name:var(--font-orbit-serif)] text-[28px] text-[var(--orbit-ink)]">
        Ahead
      </h1>
      <p className="mt-1 text-[15px] text-[var(--orbit-secondary)]">
        Money in the bank for the next 60 days.
      </p>

      <svg viewBox="0 0 100 100" className="mt-10 h-48 w-full" role="img" aria-label="Bank balance timeline">
        <polyline
          fill="none"
          stroke="var(--orbit-ink)"
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
          points={points}
        />
      </svg>

      <ul className="mt-8 space-y-3">
        {days
          .filter((d) => d.status !== "ok" || d.dayOffset === 0 || d.dayOffset % 7 === 0)
          .slice(0, 12)
          .map((d) => (
            <li
              key={d.dayOffset}
              className="flex items-baseline justify-between border-b border-[var(--orbit-line)] py-2 text-[15px]"
            >
              <span className="text-[var(--orbit-secondary)]">{formatShortDate(d.forecastDate)}</span>
              <span
                className={cn(
                  "tabular-nums text-[var(--orbit-ink)]",
                  d.status === "breach" && "text-[var(--orbit-short)]",
                  d.status === "warning" && "text-[var(--orbit-low)]",
                )}
              >
                {formatMoney(d.balanceCents)}
              </span>
            </li>
          ))}
      </ul>
    </div>
  );
}
