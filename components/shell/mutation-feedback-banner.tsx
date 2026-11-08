"use client";

import { useTranslations } from "next-intl";
import { InlineBanner } from "@/components/shell/inline-banner";
import { useInlineFeedback } from "@/hooks/use-inline-feedback";
import { cn } from "@/lib/utils";

export interface MutationFeedbackBannerProps {
  className?: string;
}

/** Says whether the last save worked, in one sentence on the screen. Never a toast. */
export function MutationFeedbackBanner({ className }: MutationFeedbackBannerProps) {
  const { feedback, dismiss } = useInlineFeedback();
  const tCommon = useTranslations("common");

  if (!feedback) {
    return null;
  }

  return (
    <div className={cn("flex items-start justify-between gap-3", className)}>
      <InlineBanner tone={feedback.tone} className="flex-1">
        {feedback.message}
      </InlineBanner>
      <button
        type="button"
        onClick={dismiss}
        className="shrink-0 text-[15px] text-[var(--orbit-secondary)]"
        aria-label={tCommon("dismissAria")}
      >
        {tCommon("dismiss")}
      </button>
    </div>
  );
}
