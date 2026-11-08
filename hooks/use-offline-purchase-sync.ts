"use client";

import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useMe } from "@/hooks/use-allowance";
import { useGlobalErrorHandler } from "@/hooks/use-global-error-handler";
import { api } from "@/lib/api/client";
import { flushPurchaseQueue } from "@/lib/offline/purchase-queue";
import { invalidateMoneyQueries } from "@/lib/query-invalidation";
import { isPurchaseRejection } from "@/lib/utils/queued-purchase";

/**
 * Send purchases saved on this device when the person is signed in and online.
 * Only this person's queue for this household is touched.
 */
export function useOfflinePurchaseSync(): void {
  const queryClient = useQueryClient();
  const me = useMe();
  const tenantId = me.data?.tenantId;
  const userId = me.data?.userId;
  const { handleCrudError, notifySuccess } = useGlobalErrorHandler();
  const tSuccess = useTranslations("success");
  const tAction = useTranslations("errors.action");

  useEffect(() => {
    if (!tenantId || !userId) return;
    const scope = { tenantId, userId };
    let flushing = false;

    async function flush(): Promise<void> {
      if (flushing || typeof navigator === "undefined" || !navigator.onLine) return;
      flushing = true;
      try {
        const result = await flushPurchaseQueue(
          scope,
          async (item) => {
            await api.createPurchase({
              amountCents: item.amountCents,
              idempotencyKey: item.idempotencyKey,
              memo: item.memo,
              bookedDate: item.bookedDate,
            });
          },
          isPurchaseRejection,
        );
        if (result.flushed > 0) {
          notifySuccess(
            result.flushed === 1
              ? tSuccess("syncedOfflineOne")
              : tSuccess("syncedOfflineMany", { count: result.flushed }),
          );
          await invalidateMoneyQueries(queryClient);
        }
      } catch (error: unknown) {
        handleCrudError(error, { action: tAction("syncOffline") });
      } finally {
        flushing = false;
      }
    }

    function onOnline(): void {
      void flush();
    }

    void flush();
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("online", onOnline);
    };
  }, [queryClient, tenantId, userId, handleCrudError, notifySuccess, tSuccess, tAction]);
}
