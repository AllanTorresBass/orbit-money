"use client";

import { useTranslations } from "next-intl";
import { useSelectTenant } from "@/hooks/use-tenant-selection";
import { cn } from "@/lib/utils";
import type { TenantChoice } from "@/types/me/me.types";

export interface TenantPickerProps {
  tenants: TenantChoice[];
  /** The household in use. Marked and not selectable again. */
  currentTenantId?: string;
  /** `page` is the full "Which household?" screen. `inline` is a section inside another screen. */
  variant?: "page" | "inline";
  /** DOM id, so a link can jump to the switcher (`/you#households`). */
  id?: string;
  className?: string;
}

/** Shown when the API asks which household to use, and as the switcher on You. */
export function TenantPicker({
  tenants,
  currentTenantId,
  variant = "page",
  id,
  className,
}: TenantPickerProps) {
  const select = useSelectTenant();
  const inline = variant === "inline";
  const t = useTranslations("you");
  const tCommon = useTranslations("common");

  return (
    <div id={id} className={cn(inline ? "mt-10" : "mx-auto max-w-md px-5 pt-10", className)}>
      {inline ? (
        <h2 className="text-[15px] font-medium text-[var(--orbit-ink)]">{t("householdsTitle")}</h2>
      ) : (
        <h1 className="font-[family-name:var(--font-orbit-display)] text-[28px] font-semibold tracking-tight text-[var(--orbit-ink)]">
          {t("whichHousehold")}
        </h1>
      )}
      <ul className={cn("orbit-group", inline ? "mt-3" : "mt-6")}>
        {tenants.map((tenant) => {
          const current = tenant.tenantId === currentTenantId;
          return (
            <li key={tenant.tenantId}>
              <button
                type="button"
                disabled={select.isPending || current}
                aria-current={current ? "true" : undefined}
                onClick={() => select.mutate(tenant.tenantId)}
                className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left text-[17px] text-[var(--orbit-ink)] transition-colors hover:bg-[var(--orbit-brand-soft)] disabled:opacity-100"
              >
                <span className="min-w-0 truncate">{tenant.tenantName}</span>
                {current ? (
                  <span className="shrink-0 rounded-full bg-[var(--orbit-brand-soft)] px-2.5 py-0.5 text-[13px] font-medium text-[var(--orbit-brand)]">
                    {tCommon("current")}
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
