"use client";

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
  return useMutation({
    mutationFn: (body: CreateAccountBody) => api.createAccount(body),
    onSuccess: async () => {
      notifySuccess("Account added");
      await invalidateMoneyQueries(queryClient);
    },
    onError: (error: unknown) => {
      handleCrudError(error, { action: "add the account" });
    },
  });
}

export function useUpdateAccountBalance() {
  const queryClient = useQueryClient();
  const { handleCrudError, notifySuccess } = useGlobalErrorHandler();
  return useMutation({
    mutationFn: (input: { id: string; balanceCents: number }) =>
      api.updateAccountBalance(input.id, input.balanceCents),
    onSuccess: async () => {
      notifySuccess("Balance updated");
      await invalidateMoneyQueries(queryClient);
    },
    onError: (error: unknown) => {
      handleCrudError(error, { action: "update the balance" });
    },
  });
}

/** "Keep at least" amount. */
export function useUpdateFloor() {
  const queryClient = useQueryClient();
  const { handleCrudError, notifySuccess } = useGlobalErrorHandler();
  return useMutation({
    mutationFn: (floorCents: number) => api.updateFloor(floorCents),
    onSuccess: async (result) => {
      notifySuccess(`Keep at least ${formatMoney(result.floorCents)}`);
      await invalidateMoneyQueries(queryClient);
    },
    onError: (error: unknown) => {
      handleCrudError(error, { action: "save that amount" });
    },
  });
}
