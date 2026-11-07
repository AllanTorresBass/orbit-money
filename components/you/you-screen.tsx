"use client";

import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { ActorSwitcher } from "@/components/shell/actor-switcher";
import { TenantPicker } from "@/components/shell/tenant-picker";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { ActivitySection } from "@/components/you/activity-section";
import { BankSection } from "@/components/you/bank-section";
import { KeepAtLeastSection } from "@/components/you/keep-at-least-section";
import { PeopleSection } from "@/components/you/people-section";
import { SuggestionsSection } from "@/components/you/suggestions-section";
import { useMe } from "@/hooks/use-allowance";
import { isApiError } from "@/lib/api/api-error";
import { isClientDevHeaderAuthEnabled } from "@/lib/auth/dev-header-auth";
import { cn } from "@/lib/utils";
import { roleLabel } from "@/lib/utils/display-labels";
import { fetchErrorMessage } from "@/lib/utils/handle-fetch-error";

export interface YouScreenProps {
  className?: string;
}

export function YouScreen({ className }: YouScreenProps) {
  const me = useMe();

  if (isApiError(me.error) && me.error.code === "tenant_selection_required") {
    return <TenantPicker tenants={me.error.tenants} className={className} />;
  }

  const canManage = me.data?.role === "owner" || me.data?.role === "admin";

  return (
    <div className={cn("mx-auto min-h-screen max-w-md px-5 pb-28 pt-8", className)}>
      <Link
        href="/today"
        className="orbit-link -ml-1 inline-flex items-center gap-1 rounded-full px-1 py-1 text-[15px]"
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
        Back
      </Link>
      <h1 className="mt-4 font-[family-name:var(--font-orbit-display)] text-[32px] font-semibold leading-tight tracking-tight text-[var(--orbit-ink)]">
        You
      </h1>

      {me.data ? (
        <dl className="orbit-group mt-6 text-[17px] text-[var(--orbit-ink)]">
          <div className="px-4 py-3.5">
            <dt className="text-[13px] text-[var(--orbit-secondary)]">Name</dt>
            <dd className="mt-0.5">{me.data.name}</dd>
          </div>
          <div className="px-4 py-3.5">
            <dt className="text-[13px] text-[var(--orbit-secondary)]">Role</dt>
            <dd className="mt-0.5">{roleLabel(me.data.role)}</dd>
          </div>
          <div className="px-4 py-3.5">
            <dt className="text-[13px] text-[var(--orbit-secondary)]">Household</dt>
            <dd className="mt-0.5">{me.data.tenantName}</dd>
          </div>
        </dl>
      ) : me.isError ? (
        <p className="mt-8 text-[var(--orbit-short)]">{fetchErrorMessage(me.error, "your details")}</p>
      ) : (
        <p className="mt-8 text-[var(--orbit-secondary)]">Loading…</p>
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
            Billing
          </h2>
          <p className="mt-2 text-[15px] text-[var(--orbit-secondary)]">
            Only the owner sees this. Orbit does not charge anything yet.
          </p>
        </section>
      ) : null}

      <section className="mt-10" aria-labelledby="you-appearance">
        <h2 id="you-appearance" className="text-[15px] font-medium text-[var(--orbit-ink)]">
          Appearance
        </h2>
        <ThemeToggle className="mt-3" />
      </section>

      <section className="mt-12 border-t border-[var(--orbit-line)] pt-6">
        {isClientDevHeaderAuthEnabled() ? (
          <>
            <p className="text-[13px] text-[var(--orbit-secondary)]">Try as</p>
            <ActorSwitcher className="mt-2" />
          </>
        ) : null}
        <Link href="/signin" className="orbit-link mt-6 block text-[15px]">
          Sign in with email
        </Link>
        <Link href="/create" className="orbit-link mt-3 block text-[15px]">
          Create another space
        </Link>
        <button
          type="button"
          className="mt-3 block text-[15px] text-[var(--orbit-secondary)] transition-colors hover:text-[var(--orbit-ink)]"
          onClick={() => {
            void signOut({ callbackUrl: "/signin" });
          }}
        >
          Sign out
        </button>
      </section>
    </div>
  );
}
