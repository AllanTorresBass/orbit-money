"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useGlobalErrorHandler } from "@/hooks/use-global-error-handler";
import { api } from "@/lib/api/client";
import { isClientDevHeaderAuthEnabled } from "@/lib/auth/dev-header-auth";
import { setTenantId } from "@/lib/dev/actor-store";

/** Pick the household to use when the person belongs to more than one. */
export function useSelectTenant() {
  const queryClient = useQueryClient();
  const { handleCrudError } = useGlobalErrorHandler();
  return useMutation({
    mutationFn: async (tenantId: string) => {
      if (isClientDevHeaderAuthEnabled()) {
        setTenantId(tenantId);
      }
      return api.selectTenant(tenantId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries();
    },
    onError: (error: unknown) => {
      handleCrudError(error, { action: "switch households" });
    },
  });
}
