import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface InlineBannerProps {
  /** `low` for a soft heads-up, `short` for something that needs attention. */
  tone?: "low" | "short";
  /** Makes the whole banner a link. */
  href?: string;
  children: ReactNode;
  className?: string;
}

/** One sentence above the hero. Inline on the screen, never a toast. */
export function InlineBanner({ tone = "low", href, children, className }: InlineBannerProps) {
  const classes = cn(
    "flex items-start gap-3 rounded-2xl border px-4 py-3 text-[15px] leading-snug text-[var(--orbit-ink)]",
    tone === "short"
      ? "border-[color-mix(in_srgb,var(--orbit-short)_30%,transparent)] bg-[color-mix(in_srgb,var(--orbit-short)_9%,var(--orbit-surface))]"
      : "border-[var(--orbit-line)] bg-[var(--orbit-surface)]",
    href && "transition-transform duration-150 active:scale-[0.99]",
    className,
  );
  const dot = (
    <span
      aria-hidden="true"
      className={cn(
        "mt-[0.4rem] size-2 shrink-0 rounded-full",
        tone === "short" ? "bg-[var(--orbit-short)]" : "bg-[var(--orbit-low)]",
      )}
    />
  );

  if (href) {
    return (
      <Link href={href} className={classes}>
        {dot}
        <span className="flex-1">{children}</span>
        <ChevronRight className="mt-0.5 size-4 shrink-0 text-[var(--orbit-secondary)]" aria-hidden="true" />
      </Link>
    );
  }

  return (
    <p role="status" className={classes}>
      {dot}
      <span className="flex-1">{children}</span>
    </p>
  );
}
