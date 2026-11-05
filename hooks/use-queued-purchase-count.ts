"use client";

import { useSyncExternalStore } from "react";
import { listQueuedPurchases, PURCHASE_QUEUE_EVENT } from "@/lib/offline/purchase-queue";

function subscribe(onChange: () => void): () => void {
  window.addEventListener(PURCHASE_QUEUE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(PURCHASE_QUEUE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** How many purchases are saved on this device and not yet sent. Zero on the server. */
export function useQueuedPurchaseCount(): number {
  return useSyncExternalStore(
    subscribe,
    () => listQueuedPurchases().length,
    () => 0,
  );
}
