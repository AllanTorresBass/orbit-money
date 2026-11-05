"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api/client";
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
    mutationFn: (input: { amountCents: number; idempotencyKey?: string }) =>
      api.createPurchase(input),
    onSuccess: async () => {
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
