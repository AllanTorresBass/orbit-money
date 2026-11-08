"use client";

import { useTranslations } from "next-intl";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useGlobalErrorHandler } from "@/hooks/use-global-error-handler";
import { api } from "@/lib/api/client";
import { isClientDevHeaderAuthEnabled } from "@/lib/auth/dev-header-auth";
import { setTenantId } from "@/lib/dev/actor-store";
import { queryKeys } from "@/lib/query-keys";
import type { AcceptInviteBody, AssignableRole, InviteBody } from "@/types/people/people.types";

export function usePeople() {
  return useQuery({
    queryKey: queryKeys.people.list(),
    queryFn: () => api.getPeople(),
  });
}

export function useInvitePerson() {
  const queryClient = useQueryClient();
  const { handleCrudError, notifySuccess } = useGlobalErrorHandler();
  const tSuccess = useTranslations("success");
  const tAction = useTranslations("errors.action");
  return useMutation({
    mutationFn: (body: InviteBody) => api.invitePerson(body),
    onSuccess: async (result) => {
      notifySuccess(result.emailed ? tSuccess("inviteEmailed") : tSuccess("invited"));
      await queryClient.invalidateQueries({ queryKey: queryKeys.people.all });
    },
    onError: (error: unknown) => {
      handleCrudError(error, { action: tAction("sendInvite") });
    },
  });
}

export function useUpdatePersonRole() {
  const queryClient = useQueryClient();
  const { handleCrudError, notifySuccess } = useGlobalErrorHandler();
  const tSuccess = useTranslations("success");
  const tAction = useTranslations("errors.action");
  return useMutation({
    mutationFn: (input: { userId: string; role: AssignableRole }) =>
      api.updatePersonRole(input.userId, input.role),
    onSuccess: async () => {
      notifySuccess(tSuccess("roleUpdated"));
      await queryClient.invalidateQueries({ queryKey: queryKeys.people.all });
    },
    onError: (error: unknown) => {
      handleCrudError(error, { action: tAction("changeRole") });
    },
  });
}

export function useRemovePerson() {
  const queryClient = useQueryClient();
  const { handleCrudError, notifySuccess } = useGlobalErrorHandler();
  const tSuccess = useTranslations("success");
  const tAction = useTranslations("errors.action");
  return useMutation({
    mutationFn: (userId: string) => api.removePerson(userId),
    onSuccess: async () => {
      notifySuccess(tSuccess("removed"));
      await queryClient.invalidateQueries({ queryKey: queryKeys.people.all });
    },
    onError: (error: unknown) => {
      handleCrudError(error, { action: tAction("removePerson") });
    },
  });
}

export function useAcceptInvite() {
  const queryClient = useQueryClient();
  const { handleCrudError, notifySuccess } = useGlobalErrorHandler();
  const tSuccess = useTranslations("success");
  const tAction = useTranslations("errors.action");
  return useMutation({
    mutationFn: (body: AcceptInviteBody) => api.acceptInvite(body),
    onSuccess: async () => {
      notifySuccess(tSuccess("youreIn"));
      await queryClient.invalidateQueries();
    },
    onError: (error: unknown) => {
      handleCrudError(error, { action: tAction("acceptInvite") });
    },
  });
}

/** Invites waiting for the signed-in person. Works before any household is active. */
export function useMyInvites() {
  return useQuery({
    queryKey: queryKeys.me.invites(),
    queryFn: () => api.getMyInvites(),
    retry: false,
  });
}

/**
 * Accept one invite, then make that household the current one so Today opens on it.
 * Uses the same accept endpoint as the People row.
 */
export function useJoinInvite() {
  const queryClient = useQueryClient();
  const { handleCrudError, notifySuccess } = useGlobalErrorHandler();
  const tSuccess = useTranslations("success");
  const tAction = useTranslations("errors.action");
  return useMutation({
    mutationFn: async (body: { tenantId: string }) => {
      const accepted = await api.acceptInvite(body);
      if (isClientDevHeaderAuthEnabled()) {
        setTenantId(body.tenantId);
      }
      await api.selectTenant(body.tenantId);
      return accepted;
    },
    onSuccess: async () => {
      notifySuccess(tSuccess("youreIn"));
      await queryClient.invalidateQueries();
    },
    onError: (error: unknown) => {
      handleCrudError(error, { action: tAction("join") });
    },
  });
}
