"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { ActorSwitcher } from "@/components/shell/actor-switcher";
import { TenantPicker } from "@/components/shell/tenant-picker";
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
    <div className={cn("mx-auto min-h-screen max-w-md px-6 pb-28 pt-8", className)}>
      <Link href="/today" className="text-[15px] text-[var(--orbit-secondary)]">
        Back
      </Link>
      <h1 className="mt-4 font-[family-name:var(--font-orbit-serif)] text-[28px] text-[var(--orbit-ink)]">
        You
      </h1>

      {me.data ? (
        <div className="mt-8 space-y-4 text-[17px] text-[var(--orbit-ink)]">
          <p>
            <span className="text-[15px] text-[var(--orbit-secondary)]">Name</span>
            <br />
            {me.data.name}
          </p>
          <p>
            <span className="text-[15px] text-[var(--orbit-secondary)]">Role</span>
            <br />
            {roleLabel(me.data.role)}
          </p>
          <p>
            <span className="text-[15px] text-[var(--orbit-secondary)]">Household</span>
            <br />
            {me.data.tenantName}
          </p>
        </div>
      ) : me.isError ? (
        <p className="mt-8 text-[var(--orbit-short)]">{fetchErrorMessage(me.error, "your details")}</p>
      ) : (
        <p className="mt-8 text-[var(--orbit-secondary)]">Loading…</p>
      )}

      <BankSection canManage={canManage} />

      <SuggestionsSection canManage={canManage} />

      {me.data ? <PeopleSection me={me.data} /> : null}

      {canManage ? <KeepAtLeastSection /> : null}

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

      <section className="mt-12 border-t border-[var(--orbit-line)] pt-6">
        {isClientDevHeaderAuthEnabled() ? (
          <>
            <p className="text-[13px] text-[var(--orbit-secondary)]">Try as</p>
            <ActorSwitcher className="mt-2" />
          </>
        ) : null}
        <Link href="/signin" className="mt-6 block text-[15px] text-[var(--orbit-ink)]">
          Sign in with email
        </Link>
        <Link href="/create" className="mt-3 block text-[15px] text-[var(--orbit-ink)]">
          Create another space
        </Link>
        <button
          type="button"
          className="mt-3 block text-[15px] text-[var(--orbit-secondary)]"
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
