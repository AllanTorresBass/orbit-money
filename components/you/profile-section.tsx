"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { ChangeNameSheet } from "@/components/you/change-name-sheet";
import { cn } from "@/lib/utils";
import { roleLabel } from "@/lib/utils/display-labels";
import type { MeDto } from "@/types/me/me.types";

export interface ProfileSectionProps {
  me: MeDto;
  className?: string;
}

export function ProfileSection({ me, className }: ProfileSectionProps) {
  const t = useTranslations("you");
  const tRoles = useTranslations("roles");
  const [open, setOpen] = useState(false);

  return (
    <section className={cn("mt-6", className)}>
      <div className="orbit-group px-4 py-3.5">
        <div className="flex items-baseline justify-between gap-3">
          <p className="min-w-0 truncate text-[17px] font-medium text-[var(--orbit-ink)]">
            {me.name}
          </p>
          <button
            type="button"
            className="orbit-link shrink-0 text-[15px]"
            aria-label={t("changeNameAria")}
            onClick={() => setOpen(true)}
          >
            {t("changeName")}
          </button>
        </div>
        <p className="mt-0.5 text-[15px] text-[var(--orbit-secondary)]">
          {roleLabel(me.role, tRoles)}
        </p>
        <p className="mt-0.5 break-all text-[15px] text-[var(--orbit-secondary)]">{me.email}</p>
        <p className="mt-0.5 text-[15px] text-[var(--orbit-secondary)]">{me.tenantName}</p>
      </div>
      <ChangeNameSheet
        open={open}
        name={me.name}
        tenantName={me.tenantName}
        onClose={() => setOpen(false)}
      />
    </section>
  );
}
