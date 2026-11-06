"use client";

import { useSyncExternalStore } from "react";
import {
  countPendingPurchases,
  countPoisonPurchases,
  PURCHASE_QUEUE_EVENT,
} from "@/lib/offline/purchase-queue";
import type { OfflineQueueScope } from "@/types/transactions/transaction.types";

function subscribe(onChange: () => void): () => void {
  window.addEventListener(PURCHASE_QUEUE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(PURCHASE_QUEUE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** How many purchases are saved on this device for this person and not yet sent. Zero on the server. */
export function useQueuedPurchaseCount(scope: OfflineQueueScope | null): number {
  const tenantId = scope?.tenantId;
  const userId = scope?.userId;
  return useSyncExternalStore(
    subscribe,
    () => (tenantId && userId ? countPendingPurchases({ tenantId, userId }) : 0),
    () => 0,
  );
}

/** How many saved purchases the server kept turning away. They wait for the person. */
export function usePoisonPurchaseCount(scope: OfflineQueueScope | null): number {
  const tenantId = scope?.tenantId;
  const userId = scope?.userId;
  return useSyncExternalStore(
    subscribe,
    () => (tenantId && userId ? countPoisonPurchases({ tenantId, userId }) : 0),
    () => 0,
  );
}
