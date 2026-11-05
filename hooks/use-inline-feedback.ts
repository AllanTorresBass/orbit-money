"use client";

import { useSyncExternalStore } from "react";
import {
  clearInlineFeedback,
  getInlineFeedback,
  subscribeInlineFeedback,
} from "@/lib/feedback/inline-feedback-store";
import type { InlineFeedback } from "@/types/shared/feedback.types";

export interface InlineFeedbackState {
  feedback: InlineFeedback | null;
  dismiss: () => void;
}

/** The current create/update/delete sentence, if any. */
export function useInlineFeedback(): InlineFeedbackState {
  const feedback = useSyncExternalStore(subscribeInlineFeedback, getInlineFeedback, () => null);
  return { feedback, dismiss: clearInlineFeedback };
}
