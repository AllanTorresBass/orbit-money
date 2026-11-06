import { cn } from "@/lib/utils";

export interface OrbitMarkProps {
  className?: string;
  /** Show the wordmark next to the symbol. */
  wordmark?: boolean;
}

/** Orbit symbol: a ring with a satellite resting on it. */
export function OrbitMark({ className, wordmark = false }: OrbitMarkProps) {
  return (
    <span className={cn("inline-flex items-center gap-2.5 text-[var(--orbit-ink)]", className)}>
      <svg viewBox="0 0 32 32" className="size-8" fill="none" aria-hidden="true">
        <circle cx="16" cy="16" r="11" stroke="currentColor" strokeWidth="2.5" opacity="0.9" />
        <circle cx="25.5" cy="10.5" r="4.5" fill="var(--orbit-brand)" />
        <circle cx="25.5" cy="10.5" r="7" fill="var(--orbit-brand)" opacity="0.18" />
      </svg>
      {wordmark ? (
        <span className="text-[22px] font-semibold tracking-tight">Orbit</span>
      ) : (
        <span className="sr-only">Orbit</span>
      )}
    </span>
  );
}
