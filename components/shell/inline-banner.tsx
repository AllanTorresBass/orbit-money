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
    "block border-l-2 pl-3 text-[15px] text-[var(--orbit-ink)]",
    tone === "short" ? "border-[var(--orbit-short)]" : "border-[var(--orbit-low)]",
    className,
  );

  if (href) {
    return (
      <Link href={href} className={classes}>
        {children}
      </Link>
    );
  }

  return (
    <p role="status" className={classes}>
      {children}
    </p>
  );
}
