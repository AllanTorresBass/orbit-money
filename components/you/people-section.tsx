"use client";

import { useState } from "react";
import {
  useAcceptInvite,
  useInvitePerson,
  usePeople,
  useRemovePerson,
  useUpdatePersonRole,
} from "@/hooks/use-people";
import { useGlobalErrorHandler } from "@/hooks/use-global-error-handler";
import { cn } from "@/lib/utils";
import { ROLE_LABELS } from "@/lib/utils/display-labels";
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

interface InviteHintNoteProps {
  result: InviteSentResult;
  className?: string;
}

/** What happened to the invite, and the link to pass on by hand. */
function InviteHintNote({ result, className }: InviteHintNoteProps) {
  const { handleCrudError, notifySuccess } = useGlobalErrorHandler();

  async function copyHint(): Promise<void> {
    try {
      await navigator.clipboard.writeText(result.inviteHint);
      notifySuccess("Link copied");
    } catch (error: unknown) {
      handleCrudError(error, { action: "copy the link" });
    }
  }

  return (
    <div className={cn("text-[15px] text-[var(--orbit-secondary)]", className)} role="status">
      <p>
        {result.emailed
          ? "We emailed them. They can also open this once they sign in:"
          : "We'll email them when mail is configured. For now, send them this to open after they sign in:"}
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
          Copy
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
      handleCrudError(new Error("Missing details"), { action: "send the invite" });
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
        <h2 className="text-[15px] font-medium text-[var(--orbit-ink)]">People</h2>
        {people.isLoading ? (
          <p className="mt-2 text-[15px] text-[var(--orbit-secondary)]">Loading…</p>
        ) : people.isError ? (
          <p className="mt-2 text-[15px] text-[var(--orbit-short)]">
            {fetchErrorMessage(people.error, "your people")}
          </p>
        ) : visible.length === 0 ? (
          <p className="mt-2 text-[15px] text-[var(--orbit-secondary)]">No one else yet.</p>
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
                      {pending ? "Invited · " : ""}
                      {ROLE_LABELS[person.role]}
                    </span>
                  </div>

                  {isSelf && pending ? (
                    <button
                      type="button"
                      disabled={accept.isPending}
                      className="mt-1 text-[15px] text-[var(--orbit-ink)] disabled:opacity-60"
                      onClick={() => accept.mutate({ tenantId: me.tenantId })}
                    >
                      Accept invite
                    </button>
                  ) : null}

                  {editable ? (
                    <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-2">
                      <label className="text-[13px] text-[var(--orbit-secondary)]">
                        Role
                        <select
                          value={person.role}
                          disabled={updateRole.isPending}
                          onChange={(e) =>
                            updateRole.mutate({
                              userId: person.userId,
                              role: e.target.value as AssignableRole,
                            })
                          }
                          aria-label={`${person.name} role`}
                          className="ml-2 border-b border-[var(--orbit-line)] bg-transparent py-1 text-[15px] text-[var(--orbit-ink)] outline-none"
                        >
                          {assignable.map((r) => (
                            <option key={r} value={r}>
                              {ROLE_LABELS[r]}
                            </option>
                          ))}
                        </select>
                      </label>

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
                            Yes, remove {person.name}
                          </button>
                          <button
                            type="button"
                            className="text-[var(--orbit-secondary)]"
                            onClick={() => setConfirmingId(null)}
                          >
                            Cancel
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="text-[15px] text-[var(--orbit-secondary)]"
                          onClick={() => setConfirmingId(person.userId)}
                        >
                          {pending ? "Cancel invite" : "Remove"}
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
          <h2 className="text-[15px] font-medium text-[var(--orbit-ink)]">Invite someone</h2>
          <input
            value={inviteName}
            onChange={(e) => setInviteName(e.target.value)}
            placeholder="Name"
            aria-label="Name"
            className="mt-3 w-full border-b border-[var(--orbit-line)] bg-transparent py-2 text-[17px] outline-none"
          />
          <input
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="Email"
            aria-label="Email"
            type="email"
            className="mt-3 w-full border-b border-[var(--orbit-line)] bg-transparent py-2 text-[17px] outline-none"
          />
          <div className="mt-3 flex flex-wrap gap-3">
            {assignable.map((role) => (
              <button
                key={role}
                type="button"
                onClick={() => setInviteRole(role)}
                className={cn(
                  "text-[15px]",
                  inviteRole === role ? "text-[var(--orbit-ink)]" : "text-[var(--orbit-secondary)]",
                )}
              >
                {ROLE_LABELS[role]}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={invite.isPending}
            className="mt-4 text-[17px] text-[var(--orbit-ink)] disabled:opacity-60"
            onClick={sendInvite}
          >
            Send invite
          </button>
          {lastInvite ? (
            <InviteHintNote result={lastInvite} className="mt-4" />
          ) : (
            <p className="mt-3 text-[13px] text-[var(--orbit-secondary)]">
              We&apos;ll email them when mail is configured.
            </p>
          )}
        </section>
      ) : null}
    </div>
  );
}
