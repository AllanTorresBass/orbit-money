"use client";

import { useSelectTenant } from "@/hooks/use-tenant-selection";
import { cn } from "@/lib/utils";
import type { TenantChoice } from "@/types/me/me.types";

export interface TenantPickerProps {
  tenants: TenantChoice[];
  className?: string;
}

/** Shown when the API asks which household to use. */
export function TenantPicker({ tenants, className }: TenantPickerProps) {
  const select = useSelectTenant();

  return (
    <div className={cn("mx-auto max-w-md px-6 pt-10", className)}>
      <h1 className="font-[family-name:var(--font-orbit-serif)] text-[28px] text-[var(--orbit-ink)]">
        Which household?
      </h1>
      <ul className="mt-6">
        {tenants.map((tenant) => (
          <li key={tenant.tenantId} className="border-b border-[var(--orbit-line)]">
            <button
              type="button"
              disabled={select.isPending}
              onClick={() => select.mutate(tenant.tenantId)}
              className="w-full py-3 text-left text-[17px] text-[var(--orbit-ink)] disabled:opacity-60"
            >
              {tenant.tenantName}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
