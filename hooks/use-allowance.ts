"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useGlobalErrorHandler } from "@/hooks/use-global-error-handler";
import { api } from "@/lib/api/client";
import { enqueuePurchase } from "@/lib/offline/purchase-queue";
import { invalidateMoneyQueries } from "@/lib/query-invalidation";
import { queryKeys } from "@/lib/query-keys";

export function useAllowance() {
  return useQuery({
    queryKey: queryKeys.allowance.current(),
    queryFn: () => api.getAllowance(),
  });
}

export function useMe() {
  return useQuery({
    queryKey: queryKeys.me.all,
    queryFn: () => api.getMe(),
  });
}

export function useCreatePurchase() {
  const queryClient = useQueryClient();
  const { handleCrudError, notifySuccess } = useGlobalErrorHandler();
  return useMutation({
    mutationFn: async (input: { amountCents: number; idempotencyKey?: string; memo?: string }) => {
      const idempotencyKey = input.idempotencyKey ?? crypto.randomUUID();
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        enqueuePurchase({
          amountCents: input.amountCents,
          idempotencyKey,
          memo: input.memo,
        });
        return { queued: true as const };
      }
      try {
        await api.createPurchase({
          amountCents: input.amountCents,
          idempotencyKey,
          memo: input.memo,
        });
        return { queued: false as const };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "";
        const looksNetwork =
          message === "Failed to fetch" || message.toLowerCase().includes("network");
        if (looksNetwork) {
          enqueuePurchase({
            amountCents: input.amountCents,
            idempotencyKey,
            memo: input.memo,
          });
          return { queued: true as const };
        }
        throw error;
      }
    },
    onSuccess: async (result) => {
      if (result.queued) {
        notifySuccess("Saved offline — will sync when you are back online");
        return;
      }
      notifySuccess("Purchase saved");
      await invalidateMoneyQueries(queryClient);
    },
    onError: (error: unknown) => {
      handleCrudError(error, { action: "save the purchase" });
    },
  });
}

export function useForecast() {
  return useQuery({
    queryKey: queryKeys.forecast.list(),
    queryFn: () => api.getForecast(),
  });
}

/** One forecast day. Pass null to stay idle until a row is tapped. */
export function useForecastDay(date: string | null) {
  return useQuery({
    queryKey: queryKeys.forecast.detail(date ?? ""),
    queryFn: () => api.getForecastDay(date ?? ""),
    enabled: date !== null,
  });
}

export function usePlan() {
  return useQuery({
    queryKey: queryKeys.plan.current(),
    queryFn: () => api.getPlan(),
  });
}
