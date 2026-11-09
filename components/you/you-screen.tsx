"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { useTranslations } from "next-intl";
import { ActorSwitcher } from "@/components/shell/actor-switcher";
import { LanguageToggle } from "@/components/shell/language-toggle";
import { TenantPicker } from "@/components/shell/tenant-picker";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { ActivitySection } from "@/components/you/activity-section";
import { BankSection } from "@/components/you/bank-section";
import { KeepAtLeastSection } from "@/components/you/keep-at-least-section";
import { PeopleSection } from "@/components/you/people-section";
import { ProfileSection } from "@/components/you/profile-section";
import { SuggestionsSection } from "@/components/you/suggestions-section";
import { useMe } from "@/hooks/use-allowance";
import { isApiError } from "@/lib/api/api-error";
import { isClientDevHeaderAuthEnabled } from "@/lib/auth/dev-header-auth";
import { cn } from "@/lib/utils";
import { fetchErrorMessage } from "@/lib/utils/handle-fetch-error";

export interface YouScreenProps {
  className?: string;
}

export function YouScreen({ className }: YouScreenProps) {
  const me = useMe();
  const t = useTranslations("you");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors");

  if (isApiError(me.error) && me.error.code === "tenant_selection_required") {
    return <TenantPicker tenants={me.error.tenants} className={className} />;
  }

  const canManage = me.data?.role === "owner" || me.data?.role === "admin";

  return (
    <div className={cn("mx-auto min-h-screen max-w-md px-5 pb-28 pt-8", className)}>
      <h1 className="font-[family-name:var(--font-orbit-display)] text-[32px] font-semibold leading-tight tracking-tight text-[var(--orbit-ink)]">
        {t("title")}
      </h1>

      {me.data ? (
        <ProfileSection me={me.data} />
      ) : (
        <div className="orbit-group mt-6 px-4 py-3.5">
          {me.isError ? (
            <p className="text-[15px] text-[var(--orbit-short)]">
              {fetchErrorMessage(me.error, tErrors("resource.yourDetails"), {
                chooseHousehold: tErrors("chooseHousehold"),
                signIn: tErrors("signIn"),
                cannotSee: tErrors("cannotSee"),
                offline: tErrors("offline"),
                couldNotLoad: tErrors("couldNotLoad"),
              })}
            </p>
          ) : (
            <p className="text-[15px] text-[var(--orbit-secondary)]">{tCommon("loading")}</p>
          )}
        </div>
      )}

      {me.data && me.data.tenants.length > 1 ? (
        <TenantPicker
          id="households"
          variant="inline"
          tenants={me.data.tenants}
          currentTenantId={me.data.tenantId}
        />
      ) : null}

      <BankSection canManage={canManage} />

      <SuggestionsSection canManage={canManage} />

      {me.data ? <PeopleSection me={me.data} /> : null}

      {canManage ? <KeepAtLeastSection /> : null}

      <ActivitySection canManage={canManage} />

      {me.data?.role === "owner" ? (
        <section className="mt-10" aria-labelledby="you-billing">
          <h2 id="you-billing" className="text-[15px] font-medium text-[var(--orbit-ink)]">
            {t("billingTitle")}
          </h2>
          <p className="mt-2 text-[15px] text-[var(--orbit-secondary)]">{t("billingBody")}</p>
        </section>
      ) : null}

      <section className="mt-10" aria-labelledby="you-appearance">
        <h2 id="you-appearance" className="text-[15px] font-medium text-[var(--orbit-ink)]">
          {t("appearanceTitle")}
        </h2>
        <p className="mt-2 text-[15px] text-[var(--orbit-secondary)]">{t("appearanceBody")}</p>
        <ThemeToggle className="mt-3" />
      </section>

      <section className="mt-10" aria-labelledby="you-language">
        <h2 id="you-language" className="text-[15px] font-medium text-[var(--orbit-ink)]">
          {tCommon("language.title")}
        </h2>
        <p className="mt-2 text-[15px] text-[var(--orbit-secondary)]">{tCommon("language.body")}</p>
        <LanguageToggle className="mt-3" mode="account" />
      </section>

      <section className="mt-12 border-t border-[var(--orbit-line)] pt-6">
        {isClientDevHeaderAuthEnabled() ? (
          <>
            <p className="text-[13px] text-[var(--orbit-secondary)]">{t("tryAs")}</p>
            <ActorSwitcher className="mt-2" />
          </>
        ) : null}
        <Link href="/signin" className="orbit-link mt-6 block text-[15px]">
          {t("signInEmail")}
        </Link>
        <Link href="/create" className="orbit-link mt-3 block text-[15px]">
          {t("createSpace")}
        </Link>
        <button
          type="button"
          className="mt-3 block text-[15px] text-[var(--orbit-secondary)] transition-colors hover:text-[var(--orbit-ink)]"
          onClick={() => {
            void signOut({ callbackUrl: "/signin" });
          }}
        >
          {t("signOut")}
        </button>
      </section>
    </div>
  );
}
