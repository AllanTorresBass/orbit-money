"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider } from "next-auth/react";
import { useEffect, useState, type ReactNode } from "react";
import { toast, Toaster } from "sonner";
import { api } from "@/lib/api/client";
import { flushPurchaseQueue } from "@/lib/offline/purchase-queue";
import { queryKeys } from "@/lib/query-keys";

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
          toast.success(
            result.flushed === 1
              ? "Synced 1 offline purchase"
              : `Synced ${result.flushed} offline purchases`,
          );
          await client.invalidateQueries({ queryKey: queryKeys.allowance.all });
          await client.invalidateQueries({ queryKey: queryKeys.forecast.all });
          await client.invalidateQueries({ queryKey: queryKeys.plan.all });
        }
      } catch (error: unknown) {
        toast.error(error instanceof Error ? error.message : "Could not sync offline purchases");
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
        <Toaster position="top-center" richColors />
      </QueryClientProvider>
    </SessionProvider>
  );
}
