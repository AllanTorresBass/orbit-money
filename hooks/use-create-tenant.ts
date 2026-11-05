"use client";

import { useMutation } from "@tanstack/react-query";
import { useGlobalErrorHandler } from "@/hooks/use-global-error-handler";
import { api } from "@/lib/api/client";
import type { CreateTenantBody } from "@/types/tenant/tenant.types";

export function useCreateTenant() {
  const { handleCrudError, notifySuccess } = useGlobalErrorHandler();
  return useMutation({
    mutationFn: (body: CreateTenantBody) => api.createTenant(body),
    onSuccess: () => {
      notifySuccess("Your space is ready");
    },
    onError: (error: unknown) => {
      handleCrudError(error, { action: "create your space" });
    },
  });
}
