"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";
import { useUpdateLocale } from "@/hooks/use-update-locale";
import { setLocaleCookie } from "@/lib/i18n/locale-cookie";
import { cn } from "@/lib/utils";
import { LOCALES, type AppLocale } from "@/types/i18n/locale.types";

const subscribe = () => () => {};

function useMounted() {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}

export interface LanguageToggleProps {
  className?: string;
  /** Cookie-only for signed-out screens. Defaults to persisting via /me when authenticated. */
  mode?: "account" | "cookie";
  /** `full` for You settings; `compact` for signed-out headers. */
  size?: "full" | "compact";
}

/** Segmented English / Español control. Endonyms stay recognizable in either UI. */
export function LanguageToggle({
  className,
  mode = "account",
  size = "full",
}: LanguageToggleProps) {
  const t = useTranslations("common.language");
  const locale = useLocale() as AppLocale;
  const mounted = useMounted();
  const router = useRouter();
  const updateLocale = useUpdateLocale();
  const saving = mode === "account" && updateLocale.isPending;
  const compact = size === "compact";

  function select(next: AppLocale): void {
    if (next === locale || saving) return;
    if (mode === "cookie") {
      setLocaleCookie(next);
      router.refresh();
      return;
    }
    updateLocale.mutate(next);
  }

  return (
    <div
      role="radiogroup"
      aria-label={t("aria")}
      aria-busy={saving || undefined}
      className={cn(
        "inline-flex rounded-full border border-[var(--orbit-line)] bg-[var(--orbit-surface)] p-1",
        compact ? "shrink-0" : "w-full",
        className,
      )}
    >
      {LOCALES.map((value) => {
        const active = mounted && locale === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            lang={value}
            disabled={saving}
            onClick={() => select(value)}
            className={cn(
              "flex items-center justify-center rounded-full font-medium transition-colors",
              compact ? "px-2.5 py-1.5 text-[12px]" : "flex-1 px-3 py-2 text-[14px]",
              active
                ? "bg-[var(--orbit-brand)] text-[var(--orbit-brand-ink)]"
                : "text-[var(--orbit-secondary)] hover:text-[var(--orbit-ink)]",
              saving && "opacity-70",
            )}
          >
            {t(value)}
          </button>
        );
      })}
    </div>
  );
}
