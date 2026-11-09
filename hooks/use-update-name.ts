"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useGlobalErrorHandler } from "@/hooks/use-global-error-handler";
import { api } from "@/lib/api/client";
import { queryKeys } from "@/lib/query-keys";
import type { MeDto } from "@/types/me/me.types";

/** Save the caller's display name and refresh the places that show it. */
export function useUpdateName() {
  const queryClient = useQueryClient();
  const tSuccess = useTranslations("success");
  const tErrors = useTranslations("errors");
  const tAction = useTranslations("errors.action");
  const { handleCrudError, notifySuccess } = useGlobalErrorHandler();

  return useMutation({
    mutationFn: (name: string) => api.updateName(name),
    onSuccess: async (me) => {
      queryClient.setQueryData<MeDto>(queryKeys.me.all, me);
      notifySuccess(tSuccess("nameSaved"));
      await queryClient.invalidateQueries({ queryKey: queryKeys.people.list() });
    },
    onError: (error: unknown) => {
      const action = tAction("updateName");
      handleCrudError(error, {
        action,
        copy: {
          cannot: tErrors("cannotAction", { action }),
          couldNot: tErrors("couldNotAction", { action }),
          chooseHousehold: tErrors("chooseHousehold"),
        },
      });
    },
  });
}
