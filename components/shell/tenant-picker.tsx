"use client";

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

  return (
    <div id={id} className={cn(inline ? "mt-10" : "mx-auto max-w-md px-6 pt-10", className)}>
      {inline ? (
        <h2 className="text-[15px] font-medium text-[var(--orbit-ink)]">Households</h2>
      ) : (
        <h1 className="font-[family-name:var(--font-orbit-serif)] text-[28px] text-[var(--orbit-ink)]">
          Which household?
        </h1>
      )}
      <ul className={inline ? "mt-2" : "mt-6"}>
        {tenants.map((tenant) => {
          const current = tenant.tenantId === currentTenantId;
          return (
            <li key={tenant.tenantId} className="border-b border-[var(--orbit-line)]">
              <button
                type="button"
                disabled={select.isPending || current}
                aria-current={current ? "true" : undefined}
                onClick={() => select.mutate(tenant.tenantId)}
                className="flex w-full items-baseline justify-between gap-3 py-3 text-left text-[17px] text-[var(--orbit-ink)] disabled:opacity-60"
              >
                <span className="min-w-0 truncate">{tenant.tenantName}</span>
                {current ? (
                  <span className="shrink-0 text-[15px] text-[var(--orbit-secondary)]">
                    Current
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
