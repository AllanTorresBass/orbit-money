"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useGlobalErrorHandler } from "@/hooks/use-global-error-handler";
import { api } from "@/lib/api/client";
import { setLocaleCookie } from "@/lib/i18n/locale-cookie";
import { queryKeys } from "@/lib/query-keys";
import type { AppLocale } from "@/types/i18n/locale.types";
import type { MeDto } from "@/types/me/me.types";

/** Persist language on the user, stamp the cookie, and refresh SSR messages. */
export function useUpdateLocale() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const t = useTranslations("common.language");
  const tErrors = useTranslations("errors.action");
  const { handleCrudError, notifySuccess } = useGlobalErrorHandler();

  return useMutation({
    mutationFn: (preferredLocale: AppLocale) => api.updateLocale(preferredLocale),
    onSuccess: (me) => {
      setLocaleCookie(me.preferredLocale);
      queryClient.setQueryData<MeDto>(queryKeys.me.all, me);
      notifySuccess(t("saved"));
      router.refresh();
    },
    onError: (error: unknown) => {
      handleCrudError(error, { action: tErrors("updateLanguage") });
    },
  });
}
