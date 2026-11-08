"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useJoinInvite, useMyInvites } from "@/hooks/use-people";
import { isApiError } from "@/lib/api/api-error";
import { cn } from "@/lib/utils";
import { joinCapabilitySentence, joinRoleSentence } from "@/lib/utils/display-labels";
import { fetchErrorMessage } from "@/lib/utils/handle-fetch-error";
import type { PendingInviteDto } from "@/types/people/people.types";

export interface InviteScreenProps {
  className?: string;
}

interface InviteCardProps {
  invite: PendingInviteDto;
  joining: boolean;
  onJoin: (tenantId: string) => void;
  className?: string;
}

function InviteCard({ invite, joining, onJoin, className }: InviteCardProps) {
  const tCommon = useTranslations("common");
  const tInvite = useTranslations("invite");
  const tRoles = useTranslations("roles");
  const who = invite.inviterName ?? tCommon("someone");
  return (
    <section className={cn("mt-10", className)}>
      <h1 className="font-[family-name:var(--font-orbit-display)] text-[28px] font-semibold tracking-tight leading-tight text-[var(--orbit-ink)]">
        {tCommon("invitedPrefix", { name: who, tenantName: invite.tenantName })}
      </h1>
      <p className="mt-6 text-[17px] text-[var(--orbit-ink)]">
        {joinRoleSentence(invite.role, tRoles)}
      </p>
      <p className="mt-1 text-[15px] text-[var(--orbit-secondary)]">
        {joinCapabilitySentence(invite.role, tRoles)}
      </p>
      <button
        type="button"
        disabled={joining}
        onClick={() => onJoin(invite.tenantId)}
        className="mt-10 w-full orbit-btn disabled:opacity-60"
      >
        {tInvite("join", { tenantName: invite.tenantName })}
      </button>
    </section>
  );
}

/** Screen 14. Lands an invited person in the household with no setup. */
export function InviteScreen({ className }: InviteScreenProps) {
  const router = useRouter();
  const invites = useMyInvites();
  const join = useJoinInvite();
  const t = useTranslations("invite");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors");

  function onJoin(tenantId: string): void {
    join.mutate(
      { tenantId },
      {
        onSuccess: () => {
          router.push("/today");
          router.refresh();
        },
      },
    );
  }

  if (invites.isLoading) {
    return (
      <div
        className={cn("mx-auto max-w-md animate-pulse px-6 pt-16", className)}
        aria-busy="true"
      >
        <div className="h-8 w-64 max-w-full rounded bg-[var(--orbit-line)]" />
        <div className="mt-8 h-4 w-40 rounded bg-[var(--orbit-line)]" />
        <div className="mt-3 h-4 w-56 max-w-full rounded bg-[var(--orbit-line)]" />
        <div className="mt-10 h-12 w-full rounded bg-[var(--orbit-line)]" />
      </div>
    );
  }

  if (invites.isError) {
    const signedOut = isApiError(invites.error) && invites.error.status === 401;
    return (
      <div className={cn("mx-auto max-w-md px-5 pt-16", className)}>
        <p className="text-[17px] text-[var(--orbit-short)]">
          {fetchErrorMessage(invites.error, tErrors("resource.yourInvite"), {
            chooseHousehold: tErrors("chooseHousehold"),
            signIn: tErrors("signIn"),
            cannotSee: tErrors("cannotSee"),
            offline: tErrors("offline"),
            couldNotLoad: tErrors("couldNotLoad"),
          })}
        </p>
        {signedOut ? (
          <Link
            href="/signin?callbackUrl=/invite"
            className="mt-6 block text-[17px] text-[var(--orbit-ink)]"
          >
            {t("signIn")}
          </Link>
        ) : (
          <button
            type="button"
            className="mt-6 text-[17px] text-[var(--orbit-ink)]"
            onClick={() => {
              void invites.refetch();
            }}
          >
            {tCommon("tryAgain")}
          </button>
        )}
      </div>
    );
  }

  const pending = invites.data?.invites ?? [];
  if (pending.length === 0) {
    return (
      <div className={cn("mx-auto max-w-md px-5 pt-16", className)}>
        <p className="text-[17px] text-[var(--orbit-ink)]">{t("empty")}</p>
        <Link href="/today" className="mt-6 block text-[17px] text-[var(--orbit-ink)]">
          {t("goToday")}
        </Link>
      </div>
    );
  }

  return (
    <div className={cn("mx-auto min-h-screen max-w-md px-5 pb-16 pt-6", className)}>
      {pending.map((invite) => (
        <InviteCard
          key={invite.tenantId}
          invite={invite}
          joining={join.isPending}
          onJoin={onJoin}
        />
      ))}
    </div>
  );
}
