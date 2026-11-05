"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api } from "@/lib/api/client";
import { setActorUserId, setTenantId } from "@/lib/dev/actor-store";
import { cn } from "@/lib/utils";

export default function CreatePage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [name, setName] = useState("Harbor");
  const [tenantType, setTenantType] = useState<"individual" | "household" | "organization">(
    "household",
  );
  const [cadence, setCadence] = useState("Every two weeks");
  const [nextPayday, setNextPayday] = useState("2026-11-18");
  const [amount, setAmount] = useState("3000");
  const [saving, setSaving] = useState(false);

  function rruleForCadence(value: string): string {
    switch (value) {
      case "Every week":
        return "FREQ=WEEKLY;INTERVAL=1";
      case "Twice a month":
        return "FREQ=MONTHLY;BYMONTHDAY=15";
      case "Every month":
        return "FREQ=MONTHLY;BYMONTHDAY=1";
      case "Once a year":
        return "FREQ=YEARLY";
      default:
        return "FREQ=WEEKLY;INTERVAL=2";
    }
  }

  async function finish(): Promise<void> {
    const dollars = Number(amount);
    if (!Number.isFinite(dollars) || dollars <= 0) {
      toast.error("Enter a payday amount");
      return;
    }
    setSaving(true);
    try {
      const created = await api.createTenant({
        name: name.trim() || "Harbor",
        tenantType,
        ownerEmail: `${name.trim().toLowerCase().replace(/\s+/g, ".") || "owner"}@orbit.local`,
        ownerName: "Owner",
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York",
        paydayAmountCents: Math.round(dollars * 100),
        nextPayday,
        rrule: rruleForCadence(cadence),
      });
      setTenantId(created.tenantId);
      setActorUserId(created.userId);
      toast.success("Your space is ready");
      router.push("/today");
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Could not create");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto min-h-screen max-w-md px-6 py-10">
      <p className="text-[15px] text-[var(--orbit-secondary)]">{step} of 3</p>
      {step === 1 ? (
        <>
          <h1 className="mt-4 font-[family-name:var(--font-orbit-serif)] text-[28px] text-[var(--orbit-ink)]">
            What should we call this?
          </h1>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-8 w-full border-b border-[var(--orbit-line)] bg-transparent py-2 text-[17px] outline-none"
            placeholder="Harbor"
          />
          <div className="mt-6 flex flex-col gap-2">
            {(
              [
                ["individual", "Personal"],
                ["household", "Household"],
                ["organization", "Organization"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setTenantType(value)}
                className={cn(
                  "py-2 text-left text-[17px]",
                  tenantType === value ? "text-[var(--orbit-ink)]" : "text-[var(--orbit-secondary)]",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="mt-10 w-full bg-[var(--orbit-ink)] py-3 text-[17px] text-[var(--orbit-paper)]"
            onClick={() => setStep(2)}
          >
            Continue
          </button>
        </>
      ) : null}

      {step === 2 ? (
        <>
          <button
            type="button"
            className="text-[15px] text-[var(--orbit-secondary)]"
            onClick={() => setStep(1)}
          >
            Back
          </button>
          <h1 className="mt-4 font-[family-name:var(--font-orbit-serif)] text-[28px] text-[var(--orbit-ink)]">
            When does money usually arrive?
          </h1>
          <div className="mt-8 flex flex-col gap-3">
            {["Every week", "Every two weeks", "Twice a month", "Every month", "Once a year"].map(
              (label) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setCadence(label)}
                  className={cn(
                    "text-left text-[17px]",
                    cadence === label ? "text-[var(--orbit-ink)]" : "text-[var(--orbit-secondary)]",
                  )}
                >
                  {label}
                </button>
              ),
            )}
          </div>
          <label className="mt-8 block text-[15px] text-[var(--orbit-secondary)]">
            Next time
            <input
              type="date"
              value={nextPayday}
              onChange={(e) => setNextPayday(e.target.value)}
              className="mt-2 block w-full border-b border-[var(--orbit-line)] bg-transparent py-2 text-[17px] text-[var(--orbit-ink)] outline-none"
            />
          </label>
          <button
            type="button"
            className="mt-10 w-full bg-[var(--orbit-ink)] py-3 text-[17px] text-[var(--orbit-paper)]"
            onClick={() => setStep(3)}
          >
            Continue
          </button>
        </>
      ) : null}

      {step === 3 ? (
        <>
          <button
            type="button"
            className="text-[15px] text-[var(--orbit-secondary)]"
            onClick={() => setStep(2)}
          >
            Back
          </button>
          <h1 className="mt-4 font-[family-name:var(--font-orbit-serif)] text-[28px] text-[var(--orbit-ink)]">
            About how much arrives?
          </h1>
          <p className="mt-2 text-[15px] text-[var(--orbit-secondary)]">
            You can fix this later. Orbit uses it to split payday.
          </p>
          <div className="mt-8 flex items-baseline gap-1">
            <span className="text-3xl">$</span>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full bg-transparent font-[family-name:var(--font-orbit-serif)] text-5xl outline-none"
              inputMode="decimal"
            />
          </div>
          <button
            type="button"
            disabled={saving}
            className="mt-10 w-full bg-[var(--orbit-ink)] py-3 text-[17px] text-[var(--orbit-paper)] disabled:opacity-60"
            onClick={() => {
              void finish();
            }}
          >
            See what I can spend
          </button>
        </>
      ) : null}
    </div>
  );
}
