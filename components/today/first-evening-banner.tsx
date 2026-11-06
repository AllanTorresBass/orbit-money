"use client";

import { useState } from "react";
import { InlineBanner } from "@/components/shell/inline-banner";
import { cn } from "@/lib/utils";

export interface FirstEveningBannerProps {
  /** Scopes the "seen this session" flag to one household. */
  tenantId: string;
  className?: string;
}

function dismissedKey(tenantId: string): string {
  return `orbit.first-evening.${tenantId}`;
}

function wasDismissed(tenantId: string): boolean {
  try {
    return window.sessionStorage.getItem(dismissedKey(tenantId)) === "1";
  } catch {
    return false;
  }
}

/**
 * The only onboarding (docs/ui/04-flows.md): one sentence, this session only.
 * Opening Plan marks it seen. Ignoring it is a complete success.
 */
export function FirstEveningBanner({ tenantId, className }: FirstEveningBannerProps) {
  const [hidden, setHidden] = useState(() => wasDismissed(tenantId));
  if (hidden) return null;

  function onOpenPlan(): void {
    try {
      window.sessionStorage.setItem(dismissedKey(tenantId), "1");
    } catch {
      // Storage can be blocked. The banner just shows again next visit.
    }
    setHidden(true);
  }

  return (
    <div className={cn("mt-4", className)} onClickCapture={onOpenPlan}>
      <InlineBanner href="/plan">Add rent whenever you like. Today already works.</InlineBanner>
    </div>
  );
}
