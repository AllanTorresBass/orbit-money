"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useGlobalErrorHandler } from "@/hooks/use-global-error-handler";
import { api } from "@/lib/api/client";
import { invalidateMoneyQueries } from "@/lib/query-invalidation";
import { queryKeys } from "@/lib/query-keys";
import type {
  EnvelopeMutationResult,
  EnvelopePayload,
  ProposalDecision,
  ReorderEnvelopesBody,
} from "@/types/plan/plan.types";

function isSuggestion(result: EnvelopeMutationResult): boolean {
  return Boolean(result.proposalId);
}

/** Pending suggestions. Only owners and admins can read them. */
export function useProposals(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.proposals.list(),
    queryFn: () => api.getProposals(),
    enabled,
    retry: false,
  });
}

export function useCreateEnvelope(kind: EnvelopePayload["tierCategory"]) {
  const queryClient = useQueryClient();
  const { handleCrudError, notifySuccess } = useGlobalErrorHandler();
  return useMutation({
    mutationFn: (body: EnvelopePayload) => api.createEnvelope(body),
    onSuccess: async (result) => {
      notifySuccess(
        isSuggestion(result) ? "Someone can review this." : kind === "fixed" ? "Bill added" : "Goal added",
      );
      await invalidateMoneyQueries(queryClient);
      await queryClient.invalidateQueries({ queryKey: queryKeys.proposals.all });
    },
    onError: (error: unknown) => {
      handleCrudError(error, { action: kind === "fixed" ? "save the bill" : "save the goal" });
    },
  });
}

export function useUpdateEnvelope() {
  const queryClient = useQueryClient();
  const { handleCrudError, notifySuccess } = useGlobalErrorHandler();
  return useMutation({
    mutationFn: (input: { id: string; body: EnvelopePayload }) =>
      api.updateEnvelope(input.id, input.body),
    onSuccess: async (result) => {
      notifySuccess(isSuggestion(result) ? "Someone can review this." : "Saved");
      await invalidateMoneyQueries(queryClient);
      await queryClient.invalidateQueries({ queryKey: queryKeys.proposals.all });
    },
    onError: (error: unknown) => {
      handleCrudError(error, { action: "save the change" });
    },
  });
}

export function useReorderEnvelopes() {
  const queryClient = useQueryClient();
  const { handleCrudError, notifySuccess } = useGlobalErrorHandler();
  return useMutation({
    mutationFn: (body: ReorderEnvelopesBody) => api.reorderEnvelopes(body),
    onSuccess: async () => {
      notifySuccess("Priority updated");
      await invalidateMoneyQueries(queryClient);
    },
    onError: (error: unknown) => {
      handleCrudError(error, { action: "change the order" });
    },
  });
}

export function useResolveProposal() {
  const queryClient = useQueryClient();
  const { handleCrudError, notifySuccess } = useGlobalErrorHandler();
  return useMutation({
    mutationFn: (input: { id: string; decision: ProposalDecision }) =>
      api.resolveProposal(input.id, input.decision),
    onSuccess: async (_result, input) => {
      notifySuccess(input.decision === "accepted" ? "Accepted" : "Declined");
      await invalidateMoneyQueries(queryClient);
      await queryClient.invalidateQueries({ queryKey: queryKeys.proposals.all });
    },
    onError: (error: unknown) => {
      handleCrudError(error, { action: "answer that suggestion" });
    },
  });
}
