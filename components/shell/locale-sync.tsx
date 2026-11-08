"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { useMe } from "@/hooks/use-allowance";
import { setLocaleCookie } from "@/lib/i18n/locale-cookie";
import { isAppLocale } from "@/types/i18n/locale.types";

export interface LocaleSyncProps {
  className?: string;
}

/**
 * After sign-in, the DB preference wins over a stale cookie. Sync once per loaded me.
 */
export function LocaleSync({ className: _className }: LocaleSyncProps) {
  const me = useMe();
  const locale = useLocale();
  const router = useRouter();
  const syncedFor = useRef<string | null>(null);

  useEffect(() => {
    const data = me.data;
    if (!data) return;
    const preferred = data.preferredLocale;
    if (!isAppLocale(preferred)) return;
    const key = `${data.userId}:${preferred}`;
    if (syncedFor.current === key) return;
    syncedFor.current = key;
    if (preferred === locale) {
      setLocaleCookie(preferred);
      return;
    }
    setLocaleCookie(preferred);
    router.refresh();
  }, [locale, me.data, router]);

  return null;
}
