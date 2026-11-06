"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useGlobalErrorHandler } from "@/hooks/use-global-error-handler";
import { api } from "@/lib/api/client";
import { invalidateMoneyQueries } from "@/lib/query-invalidation";
import { queryKeys } from "@/lib/query-keys";
import type { RecordInflowBody, RecordOutflowBody } from "@/types/transactions/transaction.types";

/** Record a payday. Owner and admin only; the server enforces it. */
export function useRecordInflow() {
  const queryClient = useQueryClient();
  const { handleCrudError, notifySuccess } = useGlobalErrorHandler();
  return useMutation({
    mutationFn: (body: RecordInflowBody) => api.recordInflow(body),
    onSuccess: async () => {
      notifySuccess("Payday recorded");
      await invalidateMoneyQueries(queryClient);
      await queryClient.invalidateQueries({ queryKey: queryKeys.pipeline.all });
    },
    onError: (error: unknown) => {
      handleCrudError(error, { action: "record the payday" });
    },
  });
}

/** Record a bill paid from the bank. Owner and admin only; the server enforces it. */
export function useRecordOutflow() {
  const queryClient = useQueryClient();
  const { handleCrudError, notifySuccess } = useGlobalErrorHandler();
  return useMutation({
    mutationFn: (body: RecordOutflowBody) => api.recordOutflow(body),
    onSuccess: async () => {
      notifySuccess("Payment recorded");
      await invalidateMoneyQueries(queryClient);
      await queryClient.invalidateQueries({ queryKey: queryKeys.pipeline.all });
    },
    onError: (error: unknown) => {
      handleCrudError(error, { action: "record the payment" });
    },
  });
}

/** Undo a purchase or a bill payment. Owner and admin only; the server enforces it. */
export function useVoidTransaction() {
  const queryClient = useQueryClient();
  const { handleCrudError, notifySuccess } = useGlobalErrorHandler();
  return useMutation({
    mutationFn: (transactionId: string) => api.voidTransaction(transactionId),
    onSuccess: async () => {
      notifySuccess("Purchase undone");
      await invalidateMoneyQueries(queryClient);
      await queryClient.invalidateQueries({ queryKey: queryKeys.pipeline.all });
    },
    onError: (error: unknown) => {
      handleCrudError(error, { action: "undo that purchase" });
    },
  });
}
