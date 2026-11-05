"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider } from "next-auth/react";
import { useEffect, useState, type ReactNode } from "react";
import { Toaster } from "sonner";
import { MutationFeedbackBanner } from "@/components/shell/mutation-feedback-banner";
import { api } from "@/lib/api/client";
import { flushPurchaseQueue } from "@/lib/offline/purchase-queue";
import { invalidateMoneyQueries } from "@/lib/query-invalidation";
import { handleCrudError, notifyCrudSuccess } from "@/lib/utils/handle-crud-error";

export interface AppProvidersProps {
  children: ReactNode;
  className?: string;
}

export function AppProviders({ children }: AppProvidersProps) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 10_000, retry: 1 },
        },
      }),
  );

  useEffect(() => {
    let flushing = false;

    async function flush(): Promise<void> {
      if (flushing || typeof navigator === "undefined" || !navigator.onLine) return;
      flushing = true;
      try {
        const result = await flushPurchaseQueue(async (item) => {
          await api.createPurchase({
            amountCents: item.amountCents,
            idempotencyKey: item.idempotencyKey,
            memo: item.memo,
          });
        });
        if (result.flushed > 0) {
          notifyCrudSuccess(
            result.flushed === 1
              ? "Synced 1 offline purchase"
              : `Synced ${result.flushed} offline purchases`,
          );
          await invalidateMoneyQueries(client);
        }
      } catch (error: unknown) {
        handleCrudError(error, { action: "sync your offline purchases" });
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
  }, [client]);

  return (
    <SessionProvider>
      <QueryClientProvider client={client}>
        {children}
        {/* Save results show here, inline on the screen. The Toaster stays for rare cases only. */}
        <div className="pointer-events-none fixed inset-x-0 top-0 z-50 mx-auto max-w-md px-6 pt-3">
          <MutationFeedbackBanner className="pointer-events-auto bg-[var(--orbit-paper)] py-2" />
        </div>
        <Toaster position="top-center" richColors />
      </QueryClientProvider>
    </SessionProvider>
  );
}
