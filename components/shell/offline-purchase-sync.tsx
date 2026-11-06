"use client";

import { useOfflinePurchaseSync } from "@/hooks/use-offline-purchase-sync";

export interface OfflinePurchaseSyncProps {
  className?: string;
}

/** Renders nothing. Mounted once inside the signed-in app so saved purchases send on reconnect. */
export function OfflinePurchaseSync(props: OfflinePurchaseSyncProps) {
  void props;
  useOfflinePurchaseSync();
  return null;
}
