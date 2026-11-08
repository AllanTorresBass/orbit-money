"use client";

import { useTranslations } from "next-intl";
import { useCallback, useMemo } from "react";
import {
  handleCrudError,
  notifyCrudSuccess,
  type HandleCrudErrorOptions,
} from "@/lib/utils/handle-crud-error";
import {
  handleFetchError,
  type HandleFetchErrorOptions,
} from "@/lib/utils/handle-fetch-error";

export interface GlobalErrorHandler {
  /** Failed create, update, or delete: log and show an inline sentence. */
  handleCrudError: (error: unknown, options: HandleCrudErrorOptions) => string;
  /** Failed read: log it. Pass `notify: true` to also show an inline sentence. */
  handleFetchError: (error: unknown, options: HandleFetchErrorOptions) => string;
  /** Successful create, update, or delete: one short inline sentence. */
  notifySuccess: (message: string) => void;
}

/** One place that tells the person a write or read worked or failed. */
export function useGlobalErrorHandler(): GlobalErrorHandler {
  const t = useTranslations("errors");

  const onCrudError = useCallback(
    (error: unknown, options: HandleCrudErrorOptions) =>
      handleCrudError(error, {
        ...options,
        copy: options.copy ?? {
          cannot: t("cannotAction"),
          couldNot: t("couldNotAction"),
          chooseHousehold: t("chooseHousehold"),
        },
      }),
    [t],
  );
  const onFetchError = useCallback(
    (error: unknown, options: HandleFetchErrorOptions) =>
      handleFetchError(error, {
        ...options,
        copy: options.copy ?? {
          chooseHousehold: t("chooseHousehold"),
          signIn: t("signIn"),
          cannotSee: t("cannotSee"),
          offline: t("offline"),
          couldNotLoad: t("couldNotLoad"),
        },
      }),
    [t],
  );
  const notifySuccess = useCallback((message: string) => notifyCrudSuccess(message), []);

  return useMemo(
    () => ({
      handleCrudError: onCrudError,
      handleFetchError: onFetchError,
      notifySuccess,
    }),
    [onCrudError, onFetchError, notifySuccess],
  );
}
