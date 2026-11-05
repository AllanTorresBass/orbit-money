"use client";

import { useState } from "react";
import { useAccounts, useCreateAccount, useUpdateAccountBalance } from "@/hooks/use-accounts";
import { useGlobalErrorHandler } from "@/hooks/use-global-error-handler";
import { cn, dollarsFromCents, formatMoney } from "@/lib/utils";
import { fetchErrorMessage } from "@/lib/utils/handle-fetch-error";
import { parseDollarsToCents } from "@/lib/utils/money-input";

export interface BankSectionProps {
  /** Owners and admins can update balances and add accounts. */
  canManage: boolean;
  className?: string;
}

export function BankSection({ canManage, className }: BankSectionProps) {
  const accounts = useAccounts();
  const updateBalance = useUpdateAccountBalance();
  const createAccount = useCreateAccount();
  const { handleCrudError } = useGlobalErrorHandler();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [balanceText, setBalanceText] = useState("");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newBalance, setNewBalance] = useState("");

  function saveBalance(id: string): void {
    const balanceCents = parseDollarsToCents(balanceText, { allowNegative: true });
    if (balanceCents === null) {
      handleCrudError(new Error("Invalid amount"), { action: "update the balance" });
      return;
    }
    updateBalance.mutate({ id, balanceCents }, { onSuccess: () => setEditingId(null) });
  }

  function saveNewAccount(): void {
    const balanceCents = parseDollarsToCents(newBalance, { allowNegative: true });
    if (!newName.trim() || balanceCents === null) {
      handleCrudError(new Error("Invalid account"), { action: "add the account" });
      return;
    }
    createAccount.mutate(
      { name: newName.trim(), balanceCents },
      {
        onSuccess: () => {
          setAdding(false);
          setNewName("");
          setNewBalance("");
        },
      },
    );
  }

  const list = accounts.data?.accounts ?? [];

  return (
    <section className={cn("mt-10", className)}>
      <h2 className="text-[15px] font-medium text-[var(--orbit-ink)]">Bank</h2>
      {accounts.isLoading ? (
        <p className="mt-2 text-[15px] text-[var(--orbit-secondary)]">Loading…</p>
      ) : accounts.isError ? (
        <p className="mt-2 text-[15px] text-[var(--orbit-short)]">
          {fetchErrorMessage(accounts.error, "your bank")}
        </p>
      ) : list.length === 0 ? (
        <p className="mt-2 text-[15px] text-[var(--orbit-secondary)]">No accounts yet.</p>
      ) : (
        <ul className="mt-2">
          {list.map((account) => (
            <li key={account.id} className="border-b border-[var(--orbit-line)] py-3">
              <div className="flex items-baseline justify-between gap-3 text-[17px]">
                <span className="min-w-0 truncate">
                  {account.name}
                  {account.isEveryday ? (
                    <span className="ml-2 text-[13px] text-[var(--orbit-secondary)]">Everyday</span>
                  ) : null}
                </span>
                <span className="shrink-0 tabular-nums">{formatMoney(account.balanceCents)}</span>
              </div>
              {canManage ? (
                editingId === account.id ? (
                  <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="text-[15px]">$</span>
                    <input
                      value={balanceText}
                      onChange={(e) => setBalanceText(e.target.value)}
                      className="min-w-0 flex-1 border-b border-[var(--orbit-line)] bg-transparent py-1 text-[15px] outline-none"
                      inputMode="decimal"
                      aria-label={`${account.name} balance`}
                    />
                    <button
                      type="button"
                      disabled={updateBalance.isPending}
                      className="text-[15px] text-[var(--orbit-ink)] disabled:opacity-60"
                      onClick={() => saveBalance(account.id)}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      className="text-[15px] text-[var(--orbit-secondary)]"
                      onClick={() => setEditingId(null)}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="mt-1 text-[13px] text-[var(--orbit-secondary)]"
                    onClick={() => {
                      setEditingId(account.id);
                      setBalanceText(dollarsFromCents(account.balanceCents));
                    }}
                  >
                    Update balance
                  </button>
                )
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canManage ? (
        adding ? (
          <div className="mt-4">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Account name"
              aria-label="Account name"
              className="w-full border-b border-[var(--orbit-line)] bg-transparent py-2 text-[17px] outline-none"
            />
            <div className="mt-3 flex items-baseline gap-1">
              <span>$</span>
              <input
                value={newBalance}
                onChange={(e) => setNewBalance(e.target.value)}
                placeholder="Balance"
                aria-label="Account balance"
                inputMode="decimal"
                className="w-full min-w-0 border-b border-[var(--orbit-line)] bg-transparent py-2 text-[17px] outline-none"
              />
            </div>
            <div className="mt-3 flex gap-4">
              <button
                type="button"
                disabled={createAccount.isPending}
                className="text-[17px] text-[var(--orbit-ink)] disabled:opacity-60"
                onClick={saveNewAccount}
              >
                Add account
              </button>
              <button
                type="button"
                className="text-[15px] text-[var(--orbit-secondary)]"
                onClick={() => setAdding(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="mt-3 text-[15px] text-[var(--orbit-ink)]"
            onClick={() => setAdding(true)}
          >
            Add an account
          </button>
        )
      ) : null}
    </section>
  );
}
