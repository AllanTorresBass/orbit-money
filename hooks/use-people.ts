"use client";

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
  return useMutation({
    mutationFn: (body: InviteBody) => api.invitePerson(body),
    onSuccess: async () => {
      notifySuccess("Invited");
      await queryClient.invalidateQueries({ queryKey: queryKeys.people.all });
    },
    onError: (error: unknown) => {
      handleCrudError(error, { action: "send the invite" });
    },
  });
}

export function useUpdatePersonRole() {
  const queryClient = useQueryClient();
  const { handleCrudError, notifySuccess } = useGlobalErrorHandler();
  return useMutation({
    mutationFn: (input: { userId: string; role: AssignableRole }) =>
      api.updatePersonRole(input.userId, input.role),
    onSuccess: async () => {
      notifySuccess("Role updated");
      await queryClient.invalidateQueries({ queryKey: queryKeys.people.all });
    },
    onError: (error: unknown) => {
      handleCrudError(error, { action: "change that role" });
    },
  });
}

export function useRemovePerson() {
  const queryClient = useQueryClient();
  const { handleCrudError, notifySuccess } = useGlobalErrorHandler();
  return useMutation({
    mutationFn: (userId: string) => api.removePerson(userId),
    onSuccess: async () => {
      notifySuccess("Removed");
      await queryClient.invalidateQueries({ queryKey: queryKeys.people.all });
    },
    onError: (error: unknown) => {
      handleCrudError(error, { action: "remove them" });
    },
  });
}

export function useAcceptInvite() {
  const queryClient = useQueryClient();
  const { handleCrudError, notifySuccess } = useGlobalErrorHandler();
  return useMutation({
    mutationFn: (body: AcceptInviteBody) => api.acceptInvite(body),
    onSuccess: async () => {
      notifySuccess("You're in");
      await queryClient.invalidateQueries();
    },
    onError: (error: unknown) => {
      handleCrudError(error, { action: "accept the invite" });
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
      notifySuccess("You're in");
      await queryClient.invalidateQueries();
    },
    onError: (error: unknown) => {
      handleCrudError(error, { action: "join" });
    },
  });
}
