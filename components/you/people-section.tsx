"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { ChoiceGroup } from "@/components/shared/choice-group";
import {
  useAcceptInvite,
  useInvitePerson,
  usePeople,
  useRemovePerson,
  useUpdatePersonRole,
} from "@/hooks/use-people";
import { useGlobalErrorHandler } from "@/hooks/use-global-error-handler";
import { cn } from "@/lib/utils";
import { roleDescription, roleLabel } from "@/lib/utils/display-labels";
import { fetchErrorMessage } from "@/lib/utils/handle-fetch-error";
import type { MeDto } from "@/types/me/me.types";
import type {
  AssignableRole,
  InviteSentResult,
  PersonDto,
  PersonRole,
} from "@/types/people/people.types";

export interface PeopleSectionProps {
  me: MeDto;
  className?: string;
}

const ALL_ASSIGNABLE: AssignableRole[] = ["advisor", "member", "admin", "read_only"];

function isManager(role: PersonRole): boolean {
  return role === "owner" || role === "admin";
}

function isAssignableRole(role: PersonRole): role is AssignableRole {
  return role === "admin" || role === "member" || role === "advisor" || role === "read_only";
}

interface InviteHintNoteProps {
  result: InviteSentResult;
  className?: string;
}

/** What happened to the invite, and the link to pass on by hand. */
function InviteHintNote({ result, className }: InviteHintNoteProps) {
  const { handleCrudError, notifySuccess } = useGlobalErrorHandler();
  const t = useTranslations("you");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors.action");
  const tSuccess = useTranslations("success");

  async function copyHint(): Promise<void> {
    try {
      await navigator.clipboard.writeText(result.inviteHint);
      notifySuccess(tSuccess("linkCopied"));
    } catch (error: unknown) {
      handleCrudError(error, { action: tErrors("copyLink") });
    }
  }

  return (
    <div className={cn("text-[15px] text-[var(--orbit-secondary)]", className)} role="status">
      <p>
        {result.emailed ? t("inviteEmailedAndLink") : t("inviteLinkOnly")}
      </p>
      <div className="mt-2 flex items-baseline justify-between gap-3">
        <span className="min-w-0 break-all text-[var(--orbit-ink)]">{result.inviteHint}</span>
        <button
          type="button"
          className="shrink-0 text-[var(--orbit-ink)]"
          onClick={() => {
            void copyHint();
          }}
        >
          {tCommon("copy")}
        </button>
      </div>
    </div>
  );
}

export function PeopleSection({ me, className }: PeopleSectionProps) {
  const people = usePeople();
  const invite = useInvitePerson();
  const updateRole = useUpdatePersonRole();
  const remove = useRemovePerson();
  const accept = useAcceptInvite();
  const { handleCrudError } = useGlobalErrorHandler();
  const t = useTranslations("you");
  const tCommon = useTranslations("common");
  const tRoles = useTranslations("roles");
  const tErrors = useTranslations("errors");

  const canManage = isManager(me.role);
  // Admins cannot hand out or change the admin role. Only the owner can.
  const assignable = me.role === "owner" ? ALL_ASSIGNABLE : ALL_ASSIGNABLE.filter((r) => r !== "admin");

  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<AssignableRole>("advisor");
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [lastInvite, setLastInvite] = useState<InviteSentResult | null>(null);

  function canEdit(person: PersonDto): boolean {
    if (!canManage || person.userId === me.userId || person.role === "owner") return false;
    if (me.role === "admin" && person.role === "admin") return false;
    return true;
  }

  function sendInvite(): void {
    if (!inviteName.trim() || !inviteEmail.trim()) {
      handleCrudError(new Error("Missing details"), { action: tErrors("action.sendInvite") });
      return;
    }
    invite.mutate(
      { name: inviteName.trim(), email: inviteEmail.trim(), role: inviteRole },
      {
        onSuccess: (result) => {
          setInviteName("");
          setInviteEmail("");
          setLastInvite(result);
        },
      },
    );
  }

  const visible = (people.data?.people ?? []).filter((p) => p.status !== "suspended");

  return (
    <div className={className}>
      <section className="mt-10">
        <h2 className="text-[15px] font-medium text-[var(--orbit-ink)]">{t("peopleTitle")}</h2>
        {people.isLoading ? (
          <p className="mt-2 text-[15px] text-[var(--orbit-secondary)]">{tCommon("loading")}</p>
        ) : people.isError ? (
          <p className="mt-2 text-[15px] text-[var(--orbit-short)]">
            {fetchErrorMessage(people.error, tErrors("resource.yourPeople"), {
              chooseHousehold: tErrors("chooseHousehold"),
              signIn: tErrors("signIn"),
              cannotSee: tErrors("cannotSee"),
              offline: tErrors("offline"),
              couldNotLoad: tErrors("couldNotLoad"),
            })}
          </p>
        ) : visible.length === 0 ? (
          <p className="mt-2 text-[15px] text-[var(--orbit-secondary)]">{t("noOneElse")}</p>
        ) : (
          <ul className="mt-2">
            {visible.map((person) => {
              const editable = canEdit(person);
              const isSelf = person.userId === me.userId;
              const pending = person.status === "invited";
              return (
                <li key={person.userId} className="border-b border-[var(--orbit-line)] py-3">
                  <div className="flex items-baseline justify-between gap-3 text-[17px]">
                    <span className="min-w-0 truncate">{person.name}</span>
                    <span className="shrink-0 text-[15px] text-[var(--orbit-secondary)]">
                      {roleLabel(person.role, tRoles)}
                    </span>
                  </div>

                  {isSelf && pending ? (
                    <button
                      type="button"
                      disabled={accept.isPending}
                      className="mt-1 text-[15px] text-[var(--orbit-ink)] disabled:opacity-60"
                      onClick={() => accept.mutate({ tenantId: me.tenantId })}
                    >
                      {t("acceptInvite")}
                    </button>
                  ) : null}

                  {editable && isAssignableRole(person.role) ? (
                    <ChoiceGroup
                      className="mt-2"
                      label={t("roleAria")}
                      value={person.role}
                      options={assignable.map((role) => ({
                        value: role,
                        label: roleLabel(role, tRoles),
                        hint: roleDescription(role, tRoles),
                      }))}
                      onChange={(role) => {
                        if (role === person.role || updateRole.isPending) return;
                        updateRole.mutate({ userId: person.userId, role });
                      }}
                    />
                  ) : (
                    <p className="mt-0.5 text-[13px] leading-snug text-[var(--orbit-secondary)]">
                      {roleDescription(person.role, tRoles)}
                    </p>
                  )}

                  {editable ? (
                    <div className="mt-2">
                      {confirmingId === person.userId ? (
                        <span className="flex gap-3 text-[15px]">
                          <button
                            type="button"
                            disabled={remove.isPending}
                            className="text-[var(--orbit-short)] disabled:opacity-60"
                            onClick={() =>
                              remove.mutate(person.userId, {
                                onSettled: () => setConfirmingId(null),
                              })
                            }
                          >
                            {tCommon("yesRemove")} {person.name}
                          </button>
                          <button
                            type="button"
                            className="text-[var(--orbit-secondary)]"
                            onClick={() => setConfirmingId(null)}
                          >
                            {tCommon("cancel")}
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="text-[15px] text-[var(--orbit-secondary)]"
                          onClick={() => setConfirmingId(person.userId)}
                        >
                          {pending ? t("cancelInvite") : tCommon("remove")}
                        </button>
                      )}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {canManage ? (
        <section className="mt-8">
          <h2 className="text-[15px] font-medium text-[var(--orbit-ink)]">{t("inviteTitle")}</h2>
          <p className="mt-2 text-[15px] text-[var(--orbit-secondary)]">{t("inviteSubtitle")}</p>
          <input
            value={inviteName}
            onChange={(e) => setInviteName(e.target.value)}
            placeholder={tCommon("name")}
            aria-label={tCommon("name")}
            className="mt-3 w-full orbit-field"
          />
          <input
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder={tCommon("email")}
            aria-label={tCommon("email")}
            type="email"
            className="mt-3 w-full orbit-field"
          />
          <ChoiceGroup
            className="mt-3"
            label={tRoles("field")}
            value={inviteRole}
            options={assignable.map((role) => ({
              value: role,
              label: roleLabel(role, tRoles),
              hint: roleDescription(role, tRoles),
            }))}
            onChange={setInviteRole}
          />
          <button
            type="button"
            disabled={invite.isPending}
            className="mt-4 text-[17px] text-[var(--orbit-ink)] disabled:opacity-60"
            onClick={sendInvite}
          >
            {t("sendInvite")}
          </button>
          {lastInvite ? (
            <InviteHintNote result={lastInvite} className="mt-4" />
          ) : (
            <p className="mt-3 text-[13px] text-[var(--orbit-secondary)]">{t("inviteFooter")}</p>
          )}
        </section>
      ) : null}
    </div>
  );
}
