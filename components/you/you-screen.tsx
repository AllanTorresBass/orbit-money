"use client";

import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ActorSwitcher } from "@/components/shell/actor-switcher";
import { useMe } from "@/hooks/use-allowance";
import { api } from "@/lib/api/client";
import { cn, formatMoney } from "@/lib/utils";

export interface YouScreenProps {
  className?: string;
}

export function YouScreen({ className }: YouScreenProps) {
  const me = useMe();
  const queryClient = useQueryClient();
  const canManage = me.data?.role === "owner" || me.data?.role === "admin";

  const people = useQuery({
    queryKey: ["people"],
    queryFn: () => api.getPeople(),
  });

  const proposals = useQuery({
    queryKey: ["proposals"],
    queryFn: () => api.getProposals(),
    enabled: canManage,
    retry: false,
  });

  const [floorDollars, setFloorDollars] = useState("200");
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"member" | "advisor" | "admin" | "read_only">(
    "advisor",
  );

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
            {me.data.role}
          </p>
          <p>
            <span className="text-[15px] text-[var(--orbit-secondary)]">Household</span>
            <br />
            {me.data.tenantName}
          </p>
        </div>
      ) : (
        <p className="mt-8 text-[var(--orbit-secondary)]">Loading…</p>
      )}

      {canManage && proposals.data && proposals.data.proposals.length > 0 ? (
        <section className="mt-10">
          <h2 className="text-[15px] font-medium text-[var(--orbit-ink)]">
            {proposals.data.proposals.length} suggestion
            {proposals.data.proposals.length === 1 ? "" : "s"}
          </h2>
          <ul className="mt-2 space-y-4">
            {proposals.data.proposals.map((p) => (
              <li key={p.id} className="border-b border-[var(--orbit-line)] pb-3">
                <p className="text-[17px] text-[var(--orbit-ink)]">
                  {p.proposedByName} suggests {p.payload.name}
                  {p.payload.targetCapCents !== null
                    ? ` ${formatMoney(p.payload.targetCapCents)}`
                    : ""}
                </p>
                <div className="mt-2 flex gap-4">
                  <button
                    type="button"
                    className="text-[15px] text-[var(--orbit-ink)]"
                    onClick={() => {
                      void api
                        .resolveProposal(p.id, "accepted")
                        .then(async () => {
                          toast.success("Accepted");
                          await queryClient.invalidateQueries();
                        })
                        .catch((error: unknown) => {
                          toast.error(error instanceof Error ? error.message : "Failed");
                        });
                    }}
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    className="text-[15px] text-[var(--orbit-secondary)]"
                    onClick={() => {
                      void api
                        .resolveProposal(p.id, "rejected")
                        .then(async () => {
                          toast.success("Declined");
                          await queryClient.invalidateQueries();
                        })
                        .catch((error: unknown) => {
                          toast.error(error instanceof Error ? error.message : "Failed");
                        });
                    }}
                  >
                    Decline
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-10">
        <h2 className="text-[15px] font-medium text-[var(--orbit-ink)]">People</h2>
        <ul className="mt-2">
          {people.data?.people.map((person) => (
            <li
              key={person.userId}
              className="flex justify-between border-b border-[var(--orbit-line)] py-3 text-[17px]"
            >
              <span>{person.name}</span>
              <span className="text-[15px] text-[var(--orbit-secondary)]">{person.role}</span>
            </li>
          ))}
        </ul>
      </section>

      {canManage ? (
        <section className="mt-8">
          <h2 className="text-[15px] font-medium text-[var(--orbit-ink)]">Invite someone</h2>
          <input
            value={inviteName}
            onChange={(e) => setInviteName(e.target.value)}
            placeholder="Name"
            className="mt-3 w-full border-b border-[var(--orbit-line)] bg-transparent py-2 text-[17px] outline-none"
          />
          <input
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="Email"
            className="mt-3 w-full border-b border-[var(--orbit-line)] bg-transparent py-2 text-[17px] outline-none"
          />
          <div className="mt-3 flex flex-wrap gap-3">
            {(["advisor", "member", "admin", "read_only"] as const).map((role) => (
              <button
                key={role}
                type="button"
                onClick={() => setInviteRole(role)}
                className={cn(
                  "text-[15px]",
                  inviteRole === role ? "text-[var(--orbit-ink)]" : "text-[var(--orbit-secondary)]",
                )}
              >
                {role === "read_only" ? "Read-only" : role}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="mt-4 text-[17px] text-[var(--orbit-ink)]"
            onClick={() => {
              if (!inviteName.trim() || !inviteEmail.trim()) {
                toast.error("Name and email are required");
                return;
              }
              void api
                .invitePerson({
                  name: inviteName.trim(),
                  email: inviteEmail.trim(),
                  role: inviteRole,
                })
                .then(async () => {
                  toast.success("Invited");
                  setInviteName("");
                  setInviteEmail("");
                  await queryClient.invalidateQueries({ queryKey: ["people"] });
                })
                .catch((error: unknown) => {
                  toast.error(error instanceof Error ? error.message : "Invite failed");
                });
            }}
          >
            Send invite
          </button>
        </section>
      ) : null}

      {canManage ? (
        <section className="mt-10">
          <h2 className="text-[15px] font-medium text-[var(--orbit-ink)]">Keep at least</h2>
          <div className="mt-3 flex items-baseline gap-1">
            <span>$</span>
            <input
              value={floorDollars}
              onChange={(e) => setFloorDollars(e.target.value)}
              className="w-full border-b border-[var(--orbit-line)] bg-transparent py-2 text-[17px] outline-none"
              inputMode="decimal"
            />
          </div>
          <button
            type="button"
            className="mt-4 text-[17px] text-[var(--orbit-ink)]"
            onClick={() => {
              const n = Number(floorDollars);
              if (!Number.isFinite(n) || n < 0) {
                toast.error("Enter a valid amount");
                return;
              }
              void api
                .updateFloor(Math.round(n * 100))
                .then(async () => {
                  toast.success(`Keep at least ${formatMoney(Math.round(n * 100))}`);
                  await queryClient.invalidateQueries();
                })
                .catch((error: unknown) => {
                  toast.error(error instanceof Error ? error.message : "Could not save");
                });
            }}
          >
            Save
          </button>
        </section>
      ) : null}

      <section className="mt-12 border-t border-[var(--orbit-line)] pt-6">
        <p className="text-[13px] text-[var(--orbit-secondary)]">Try as</p>
        <ActorSwitcher className="mt-2" />
        <Link href="/create" className="mt-6 block text-[15px] text-[var(--orbit-ink)]">
          Create another space
        </Link>
      </section>
    </div>
  );
}
