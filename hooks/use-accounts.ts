"use client";

import { useLocale, useTranslations } from "next-intl";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useGlobalErrorHandler } from "@/hooks/use-global-error-handler";
import { api } from "@/lib/api/client";
import { invalidateMoneyQueries } from "@/lib/query-invalidation";
import { queryKeys } from "@/lib/query-keys";
import { formatMoney } from "@/lib/utils";
import type { CreateAccountBody } from "@/types/account/account.types";

export function useAccounts() {
  return useQuery({
    queryKey: queryKeys.accounts.list(),
    queryFn: () => api.getAccounts(),
  });
}

export function useCreateAccount() {
  const queryClient = useQueryClient();
  const { handleCrudError, notifySuccess } = useGlobalErrorHandler();
  const tSuccess = useTranslations("success");
  const tAction = useTranslations("errors.action");
  return useMutation({
    mutationFn: (body: CreateAccountBody) => api.createAccount(body),
    onSuccess: async () => {
      notifySuccess(tSuccess("accountAdded"));
      await invalidateMoneyQueries(queryClient);
    },
    onError: (error: unknown) => {
      handleCrudError(error, { action: tAction("addAccount") });
    },
  });
}

export function useUpdateAccountBalance() {
  const queryClient = useQueryClient();
  const { handleCrudError, notifySuccess } = useGlobalErrorHandler();
  const tSuccess = useTranslations("success");
  const tAction = useTranslations("errors.action");
  return useMutation({
    mutationFn: (input: { id: string; balanceCents: number }) =>
      api.updateAccountBalance(input.id, input.balanceCents),
    onSuccess: async () => {
      notifySuccess(tSuccess("balanceUpdated"));
      await invalidateMoneyQueries(queryClient);
    },
    onError: (error: unknown) => {
      handleCrudError(error, { action: tAction("updateBalance") });
    },
  });
}

/** "Keep at least" amount. */
export function useUpdateFloor() {
  const queryClient = useQueryClient();
  const locale = useLocale();
  const { handleCrudError, notifySuccess } = useGlobalErrorHandler();
  const tSuccess = useTranslations("success");
  const tAction = useTranslations("errors.action");
  return useMutation({
    mutationFn: (floorCents: number) => api.updateFloor(floorCents),
    onSuccess: async (result) => {
      notifySuccess(
        tSuccess("keepAtLeast", { amount: formatMoney(result.floorCents, { locale }) }),
      );
      await invalidateMoneyQueries(queryClient);
    },
    onError: (error: unknown) => {
      handleCrudError(error, { action: tAction("saveKeepAtLeast") });
    },
  });
}
