"use client";

import { useTranslations } from "next-intl";
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
  UpdateScheduleBody,
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
  const tSuccess = useTranslations("success");
  const tAction = useTranslations("errors.action");
  return useMutation({
    mutationFn: (body: EnvelopePayload) => api.createEnvelope(body),
    onSuccess: async (result) => {
      notifySuccess(
        isSuggestion(result)
          ? tSuccess("suggestionSent")
          : kind === "fixed"
            ? tSuccess("billAdded")
            : tSuccess("goalAdded"),
      );
      await invalidateMoneyQueries(queryClient);
      await queryClient.invalidateQueries({ queryKey: queryKeys.proposals.all });
    },
    onError: (error: unknown) => {
      handleCrudError(error, {
        action: kind === "fixed" ? tAction("saveBill") : tAction("saveGoal"),
      });
    },
  });
}

export function useUpdateEnvelope() {
  const queryClient = useQueryClient();
  const { handleCrudError, notifySuccess } = useGlobalErrorHandler();
  const tSuccess = useTranslations("success");
  const tAction = useTranslations("errors.action");
  return useMutation({
    mutationFn: (input: { id: string; body: EnvelopePayload }) =>
      api.updateEnvelope(input.id, input.body),
    onSuccess: async (result) => {
      notifySuccess(isSuggestion(result) ? tSuccess("suggestionSent") : tSuccess("saved"));
      await invalidateMoneyQueries(queryClient);
      await queryClient.invalidateQueries({ queryKey: queryKeys.proposals.all });
    },
    onError: (error: unknown) => {
      handleCrudError(error, { action: tAction("saveChange") });
    },
  });
}

export function useReorderEnvelopes() {
  const queryClient = useQueryClient();
  const { handleCrudError, notifySuccess } = useGlobalErrorHandler();
  const tSuccess = useTranslations("success");
  const tAction = useTranslations("errors.action");
  return useMutation({
    mutationFn: (body: ReorderEnvelopesBody) => api.reorderEnvelopes(body),
    onSuccess: async () => {
      notifySuccess(tSuccess("priorityUpdated"));
      await invalidateMoneyQueries(queryClient);
    },
    onError: (error: unknown) => {
      handleCrudError(error, { action: tAction("changeOrder") });
    },
  });
}

export function useResolveProposal() {
  const queryClient = useQueryClient();
  const { handleCrudError, notifySuccess } = useGlobalErrorHandler();
  const tSuccess = useTranslations("success");
  const tAction = useTranslations("errors.action");
  return useMutation({
    mutationFn: (input: { id: string; decision: ProposalDecision }) =>
      api.resolveProposal(input.id, input.decision),
    onSuccess: async (_result, input) => {
      notifySuccess(input.decision === "accepted" ? tSuccess("accepted") : tSuccess("declined"));
      await invalidateMoneyQueries(queryClient);
      await queryClient.invalidateQueries({ queryKey: queryKeys.proposals.all });
    },
    onError: (error: unknown) => {
      handleCrudError(error, { action: tAction("answerSuggestion") });
    },
  });
}

/** Take a bill or goal off the Plan. Owner and admin only; the server enforces it. */
export function useRemoveEnvelope(kind: EnvelopePayload["tierCategory"]) {
  const queryClient = useQueryClient();
  const { handleCrudError, notifySuccess } = useGlobalErrorHandler();
  const tSuccess = useTranslations("success");
  const tAction = useTranslations("errors.action");
  return useMutation({
    mutationFn: (id: string) => api.removeEnvelope(id),
    onSuccess: async (result) => {
      notifySuccess(
        result.archived
          ? kind === "fixed"
            ? tSuccess("billRemoved")
            : tSuccess("goalRemoved")
          : tSuccess("billOffPayday"),
      );
      await invalidateMoneyQueries(queryClient);
    },
    onError: (error: unknown) => {
      handleCrudError(error, {
        action: kind === "fixed" ? tAction("removeBill") : tAction("removeGoal"),
      });
    },
  });
}

/** Change a payday or bill schedule. Owner and admin only; the server enforces it. */
export function useUpdateSchedule() {
  const queryClient = useQueryClient();
  const { handleCrudError, notifySuccess } = useGlobalErrorHandler();
  const tSuccess = useTranslations("success");
  const tAction = useTranslations("errors.action");
  return useMutation({
    mutationFn: (input: { id: string; body: UpdateScheduleBody }) =>
      api.updateSchedule(input.id, input.body),
    onSuccess: async () => {
      notifySuccess(tSuccess("saved"));
      await invalidateMoneyQueries(queryClient);
    },
    onError: (error: unknown) => {
      handleCrudError(error, { action: tAction("saveSchedule") });
    },
  });
}

/** Move a goal's leftover money into Spending. Owner and admin only; the server enforces it. */
export function useMoveEnvelopeToSpending() {
  const queryClient = useQueryClient();
  const { handleCrudError, notifySuccess } = useGlobalErrorHandler();
  const tSuccess = useTranslations("success");
  const tAction = useTranslations("errors.action");
  return useMutation({
    mutationFn: (id: string) => api.moveEnvelopeToSpending(id),
    onSuccess: async () => {
      notifySuccess(tSuccess("movedToSpending"));
      await invalidateMoneyQueries(queryClient);
    },
    onError: (error: unknown) => {
      handleCrudError(error, { action: tAction("moveMoney") });
    },
  });
}
