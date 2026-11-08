"use client";

import { useTranslations } from "next-intl";
import { useMutation } from "@tanstack/react-query";
import { useGlobalErrorHandler } from "@/hooks/use-global-error-handler";
import { api } from "@/lib/api/client";
import type { CreateTenantBody } from "@/types/tenant/tenant.types";

export function useCreateTenant() {
  const { handleCrudError, notifySuccess } = useGlobalErrorHandler();
  const tSuccess = useTranslations("success");
  const tAction = useTranslations("errors.action");
  return useMutation({
    mutationFn: (body: CreateTenantBody) => api.createTenant(body),
    onSuccess: () => {
      notifySuccess(tSuccess("spaceReady"));
    },
    onError: (error: unknown) => {
      handleCrudError(error, { action: tAction("createSpace") });
    },
  });
}
