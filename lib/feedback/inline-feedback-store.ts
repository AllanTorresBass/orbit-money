import type { InlineFeedback } from "@/types/shared/feedback.types";

/** Success fades quickly. A failure stays until read, then clears. */
const SUCCESS_MS = 4_000;
const FAILURE_MS = 9_000;

type Listener = () => void;

let current: InlineFeedback | null = null;
let sequence = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<Listener>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function subscribeInlineFeedback(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getInlineFeedback(): InlineFeedback | null {
  return current;
}

export function clearInlineFeedback(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (current !== null) {
    current = null;
    emit();
  }
}

/** Show one sentence inline. A newer sentence replaces the older one. */
export function pushInlineFeedback(tone: InlineFeedback["tone"], message: string): void {
  if (timer) clearTimeout(timer);
  sequence += 1;
  current = { id: sequence, tone, message };
  emit();
  timer = setTimeout(clearInlineFeedback, tone === "short" ? FAILURE_MS : SUCCESS_MS);
}
