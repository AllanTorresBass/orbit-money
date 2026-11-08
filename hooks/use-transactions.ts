"use client";

import { useTranslations } from "next-intl";
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
  const tSuccess = useTranslations("success");
  const tAction = useTranslations("errors.action");
  return useMutation({
    mutationFn: (body: RecordInflowBody) => api.recordInflow(body),
    onSuccess: async () => {
      notifySuccess(tSuccess("paydayRecorded"));
      await invalidateMoneyQueries(queryClient);
      await queryClient.invalidateQueries({ queryKey: queryKeys.pipeline.all });
    },
    onError: (error: unknown) => {
      handleCrudError(error, { action: tAction("recordPayday") });
    },
  });
}

/** Record a bill paid from the bank. Owner and admin only; the server enforces it. */
export function useRecordOutflow() {
  const queryClient = useQueryClient();
  const { handleCrudError, notifySuccess } = useGlobalErrorHandler();
  const tSuccess = useTranslations("success");
  const tAction = useTranslations("errors.action");
  return useMutation({
    mutationFn: (body: RecordOutflowBody) => api.recordOutflow(body),
    onSuccess: async () => {
      notifySuccess(tSuccess("paymentRecorded"));
      await invalidateMoneyQueries(queryClient);
      await queryClient.invalidateQueries({ queryKey: queryKeys.pipeline.all });
    },
    onError: (error: unknown) => {
      handleCrudError(error, { action: tAction("recordPayment") });
    },
  });
}

/** Undo a purchase or a bill payment. Owner and admin only; the server enforces it. */
export function useVoidTransaction() {
  const queryClient = useQueryClient();
  const { handleCrudError, notifySuccess } = useGlobalErrorHandler();
  const tSuccess = useTranslations("success");
  const tAction = useTranslations("errors.action");
  return useMutation({
    mutationFn: (transactionId: string) => api.voidTransaction(transactionId),
    onSuccess: async () => {
      notifySuccess(tSuccess("purchaseUndone"));
      await invalidateMoneyQueries(queryClient);
      await queryClient.invalidateQueries({ queryKey: queryKeys.pipeline.all });
    },
    onError: (error: unknown) => {
      handleCrudError(error, { action: tAction("undoPurchase") });
    },
  });
}
