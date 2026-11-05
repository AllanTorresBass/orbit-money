"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api/client";
import { enqueuePurchase } from "@/lib/offline/purchase-queue";
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
        toast.success("Saved offline — will sync when you are back online");
        return;
      }
      toast.success("Purchase saved");
      await queryClient.invalidateQueries({ queryKey: queryKeys.allowance.all });
      await queryClient.invalidateQueries({ queryKey: queryKeys.forecast.all });
      await queryClient.invalidateQueries({ queryKey: queryKeys.plan.all });
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : "Could not save purchase");
    },
  });
}

export function useForecast() {
  return useQuery({
    queryKey: queryKeys.forecast.list(),
    queryFn: () => api.getForecast(),
  });
}

export function usePlan() {
  return useQuery({
    queryKey: queryKeys.plan.current(),
    queryFn: () => api.getPlan(),
  });
}
