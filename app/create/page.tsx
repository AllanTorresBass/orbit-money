"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, useWatch, type FieldPath } from "react-hook-form";
import { useCreateTenant } from "@/hooks/use-create-tenant";
import { setActorUserId, setTenantId } from "@/lib/dev/actor-store";
import { cn } from "@/lib/utils";
import { rrulesForCadence } from "@/lib/utils/cadence";
import { parseDollarsToCents } from "@/lib/utils/money-input";
import {
  CADENCES,
  PAYDAY_DAY_OPTIONS,
  createSpaceDefaults,
  createSpaceFormSchema,
  type CreateSpaceForm,
} from "@/types/tenant/create-space.types";

const STEP_FIELDS: Record<1 | 2 | 3, FieldPath<CreateSpaceForm>[]> = {
  1: ["name", "tenantType"],
  2: ["cadence", "nextPayday", "firstDay", "secondDay"],
  3: ["amount"],
};

const FIELD_CLASS =
  "mt-2 block w-full border-b border-[var(--orbit-line)] bg-transparent py-2 text-[17px] text-[var(--orbit-ink)] outline-none";

export default function CreatePage() {
  const router = useRouter();
  const createTenant = useCreateTenant();
  const [step, setStep] = useState<1 | 2 | 3>(1);

  const form = useForm<CreateSpaceForm>({
    resolver: zodResolver(createSpaceFormSchema),
    defaultValues: createSpaceDefaults,
    mode: "onTouched",
  });
  const { register, control, setValue, trigger, handleSubmit, formState } = form;
  const { errors } = formState;

  const tenantType = useWatch({ control, name: "tenantType" });
  const cadence = useWatch({ control, name: "cadence" });

  async function goTo(next: 1 | 2 | 3): Promise<void> {
    if (next > step) {
      const ok = await trigger(STEP_FIELDS[step]);
      if (!ok) return;
    }
    setStep(next);
  }

  function onSubmit(values: CreateSpaceForm): void {
    const paydayAmountCents = parseDollarsToCents(values.amount);
    if (paydayAmountCents === null) return;
    const name = values.name.trim();
    const rrules = rrulesForCadence(values.cadence, {
      firstDay: values.firstDay,
      secondDay: values.secondDay,
    });

    createTenant.mutate(
      {
        name,
        tenantType: values.tenantType,
        ownerEmail: `${name.toLowerCase().replace(/\s+/g, ".") || "owner"}@orbit.local`,
        ownerName: "Owner",
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York",
        paydayAmountCents,
        nextPayday: values.nextPayday,
        ...(rrules.length === 1 ? { rrule: rrules[0] } : { rrules }),
      },
      {
        onSuccess: (created) => {
          setTenantId(created.tenantId);
          setActorUserId(created.userId);
          router.push("/today");
        },
      },
    );
  }

  return (
    <form
      className="mx-auto min-h-screen max-w-md px-6 py-10"
      onSubmit={(event) => {
        // Enter on an earlier step moves on. Only step 3 creates the space.
        if (step !== 3) {
          event.preventDefault();
          void goTo((step + 1) as 2 | 3);
          return;
        }
        void handleSubmit(onSubmit)(event);
      }}
      noValidate
    >
      <p className="text-[15px] text-[var(--orbit-secondary)]">{step} of 3</p>
      {step === 1 ? (
        <>
          <h1 className="mt-4 font-[family-name:var(--font-orbit-serif)] text-[28px] text-[var(--orbit-ink)]">
            What should we call this?
          </h1>
          <input
            {...register("name")}
            className="mt-8 w-full border-b border-[var(--orbit-line)] bg-transparent py-2 text-[17px] outline-none"
            placeholder="Harbor"
            aria-label="Name"
          />
          {errors.name ? (
            <p className="mt-2 text-[15px] text-[var(--orbit-short)]">{errors.name.message}</p>
          ) : null}
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
                onClick={() => setValue("tenantType", value)}
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
            onClick={() => {
              void goTo(2);
            }}
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
            onClick={() => {
              void goTo(1);
            }}
          >
            Back
          </button>
          <h1 className="mt-4 font-[family-name:var(--font-orbit-serif)] text-[28px] text-[var(--orbit-ink)]">
            When does money usually arrive?
          </h1>
          <div className="mt-8 flex flex-col gap-3">
            {CADENCES.map((label) => (
              <button
                key={label}
                type="button"
                onClick={() => setValue("cadence", label)}
                className={cn(
                  "text-left text-[17px]",
                  cadence === label ? "text-[var(--orbit-ink)]" : "text-[var(--orbit-secondary)]",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {cadence === "Twice a month" ? (
            <div className="mt-6 flex flex-wrap items-baseline gap-x-4 gap-y-3 text-[15px] text-[var(--orbit-secondary)]">
              <label>
                First day
                <select
                  {...register("firstDay", { valueAsNumber: true })}
                  className="ml-2 border-b border-[var(--orbit-line)] bg-transparent py-1 text-[17px] text-[var(--orbit-ink)] outline-none"
                >
                  {PAYDAY_DAY_OPTIONS.map((day) => (
                    <option key={day} value={day}>
                      {day}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Second day
                <select
                  {...register("secondDay", { valueAsNumber: true })}
                  className="ml-2 border-b border-[var(--orbit-line)] bg-transparent py-1 text-[17px] text-[var(--orbit-ink)] outline-none"
                >
                  {PAYDAY_DAY_OPTIONS.map((day) => (
                    <option key={day} value={day}>
                      {day}
                    </option>
                  ))}
                </select>
              </label>
              {errors.secondDay ? (
                <p className="w-full text-[15px] text-[var(--orbit-short)]">
                  {errors.secondDay.message}
                </p>
              ) : null}
            </div>
          ) : null}

          <label className="mt-8 block text-[15px] text-[var(--orbit-secondary)]">
            {cadence === "Twice a month" ? "Starting from" : "Next time"}
            <input type="date" {...register("nextPayday")} className={FIELD_CLASS} />
          </label>
          {errors.nextPayday ? (
            <p className="mt-2 text-[15px] text-[var(--orbit-short)]">Pick a date</p>
          ) : null}
          <button
            type="button"
            className="mt-10 w-full bg-[var(--orbit-ink)] py-3 text-[17px] text-[var(--orbit-paper)]"
            onClick={() => {
              void goTo(3);
            }}
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
            onClick={() => {
              void goTo(2);
            }}
          >
            Back
          </button>
          <h1 className="mt-4 font-[family-name:var(--font-orbit-serif)] text-[28px] text-[var(--orbit-ink)]">
            About how much arrives?
          </h1>
          <p className="mt-2 text-[15px] text-[var(--orbit-secondary)]">
            {cadence === "Twice a month"
              ? "Each time. You can fix this later. Orbit uses it to split payday."
              : "You can fix this later. Orbit uses it to split payday."}
          </p>
          <div className="mt-8 flex items-baseline gap-1">
            <span className="text-3xl">$</span>
            <input
              {...register("amount")}
              className="w-full min-w-0 bg-transparent font-[family-name:var(--font-orbit-serif)] text-5xl outline-none"
              inputMode="decimal"
              aria-label="Payday amount"
            />
          </div>
          {errors.amount ? (
            <p className="mt-2 text-[15px] text-[var(--orbit-short)]">{errors.amount.message}</p>
          ) : null}
          <button
            type="submit"
            disabled={createTenant.isPending}
            className="mt-10 w-full bg-[var(--orbit-ink)] py-3 text-[17px] text-[var(--orbit-paper)] disabled:opacity-60"
          >
            See what I can spend
          </button>
        </>
      ) : null}
    </form>
  );
}
