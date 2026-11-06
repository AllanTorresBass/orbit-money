"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useGlobalErrorHandler } from "@/hooks/use-global-error-handler";
import { api } from "@/lib/api/client";
import { enqueuePurchase } from "@/lib/offline/purchase-queue";
import { invalidateMoneyQueries } from "@/lib/query-invalidation";
import { queryKeys } from "@/lib/query-keys";
import { applyQueuedPurchase, isNetworkFailure } from "@/lib/utils/queued-purchase";
import type { AllowanceDto } from "@/types/allowance/allowance.types";
import type { MeDto } from "@/types/me/me.types";
import type { OfflineQueueScope } from "@/types/transactions/transaction.types";

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

  /** The household and person this device is signed in as. Null until Me has loaded. */
  function currentScope(): OfflineQueueScope | null {
    const me = queryClient.getQueryData<MeDto>(queryKeys.me.all);
    return me ? { tenantId: me.tenantId, userId: me.userId } : null;
  }

  return useMutation({
    mutationFn: async (input: { amountCents: number; idempotencyKey?: string; memo?: string }) => {
      const idempotencyKey = input.idempotencyKey ?? crypto.randomUUID();
      const scope = currentScope();
      const saveOnDevice = (): { queued: true } => {
        if (!scope) throw new Error("Cannot queue without a household");
        enqueuePurchase(scope, {
          amountCents: input.amountCents,
          idempotencyKey,
          memo: input.memo,
        });
        return { queued: true as const };
      };
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        return saveOnDevice();
      }
      try {
        await api.createPurchase({
          amountCents: input.amountCents,
          idempotencyKey,
          memo: input.memo,
        });
        return { queued: false as const };
      } catch (error: unknown) {
        if (scope && isNetworkFailure(error)) {
          return saveOnDevice();
        }
        throw error;
      }
    },
    onSuccess: async (result, variables) => {
      if (result.queued) {
        // Offline: move today's number now. The flush on reconnect refetches the real one.
        queryClient.setQueryData<AllowanceDto>(queryKeys.allowance.current(), (previous) =>
          previous ? applyQueuedPurchase(previous, variables.amountCents) : previous,
        );
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
