"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Suspense, useMemo, useState } from "react";
import { useForm, useWatch, type FieldPath } from "react-hook-form";
import { ChoiceGroup, type ChoiceOption } from "@/components/shared/choice-group";
import { LanguageToggle } from "@/components/shell/language-toggle";
import { useCreateTenant } from "@/hooks/use-create-tenant";
import { setActorUserId, setTenantId } from "@/lib/dev/actor-store";
import { rrulesForCadence } from "@/lib/utils/cadence";
import { cadenceHint, cadenceLabel } from "@/lib/utils/display-labels";
import { parseDollarsToCents } from "@/lib/utils/money-input";
import { resolveOwnerEmail } from "@/lib/utils/owner-email";
import {
  CADENCES,
  LAST_DAY_OF_MONTH,
  PAYDAY_DAY_CHOICES,
  createSpaceDefaults,
  createSpaceFormSchema,
  type CreateSpaceForm,
} from "@/types/tenant/create-space.types";

const STEP_FIELDS: Record<1 | 2 | 3, FieldPath<CreateSpaceForm>[]> = {
  1: ["name", "tenantType"],
  2: ["cadence", "nextPayday", "firstDay", "secondDay", "monthDay"],
  3: ["amount"],
};

const FIELD_CLASS = "mt-2 block w-full orbit-field";

function CreateForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const createTenant = useCreateTenant();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const t = useTranslations("create");
  const tCommon = useTranslations("common");
  const tCadences = useTranslations("cadences");

  const whoOptions = useMemo(
    () =>
      [
        { value: "individual", label: t("personal"), hint: t("personalHint") },
        { value: "household", label: t("household"), hint: t("householdHint") },
        { value: "organization", label: t("organization"), hint: t("organizationHint") },
      ] as const satisfies readonly ChoiceOption<CreateSpaceForm["tenantType"]>[],
    [t],
  );

  const cadenceOptions = useMemo(
    () =>
      CADENCES.map((value) => ({
        value,
        label: cadenceLabel(value, tCadences),
        hint: cadenceHint(value, tCadences),
      })),
    [tCadences],
  );

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

  /** Step 1 leaves Create. Later steps only move within the wizard. */
  function onBack(): void {
    if (step === 2) {
      void goTo(1);
      return;
    }
    if (step === 3) {
      void goTo(2);
      return;
    }
    // Sign in sends unknown emails here with ?email=. You opens /create bare.
    if (searchParams.get("email")) {
      router.push("/signin");
      return;
    }
    router.push("/you");
  }

  function onSubmit(values: CreateSpaceForm): void {
    const paydayAmountCents = parseDollarsToCents(values.amount);
    if (paydayAmountCents === null) return;
    const name = values.name.trim();
    const owner = resolveOwnerEmail({
      queryEmail: searchParams.get("email"),
      sessionEmail: session?.user?.email ?? null,
      spaceName: name,
    });
    const rrules = rrulesForCadence(values.cadence, {
      firstDay: values.firstDay,
      secondDay: values.secondDay,
      monthDay: values.monthDay,
    });

    createTenant.mutate(
      {
        name,
        tenantType: values.tenantType,
        ownerEmail: owner.email,
        ownerName: owner.name,
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
      className="mx-auto min-h-screen max-w-md px-5 py-10"
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
      <div className="flex items-center justify-between gap-3">
        <p className="text-[15px] text-[var(--orbit-secondary)]">
          {tCommon("stepOf", { current: step, total: 3 })}
        </p>
        <LanguageToggle mode="cookie" size="compact" />
      </div>
      <button type="button" className="orbit-dismiss mt-4" onClick={onBack}>
        {tCommon("back")}
      </button>
      {step === 1 ? (
        <>
          <h1 className="mt-4 font-[family-name:var(--font-orbit-display)] text-[28px] font-semibold tracking-tight text-[var(--orbit-ink)]">
            {t("step1Title")}
          </h1>
          <p className="mt-3 text-[16px] leading-relaxed text-[var(--orbit-secondary)]">
            {t("step1Body")}
          </p>
          <input
            {...register("name")}
            className="mt-8 w-full orbit-field"
            placeholder={t("namePlaceholder")}
            aria-label={t("nameAria")}
          />
          {errors.name?.message ? (
            <p className="mt-2 text-[15px] text-[var(--orbit-short)]">
              {t(errors.name.message as "nameRequired")}
            </p>
          ) : null}
          <ChoiceGroup
            className="mt-6"
            label={t("whoLabel")}
            value={tenantType}
            options={whoOptions}
            onChange={(value) => setValue("tenantType", value)}
          />
          <button
            type="button"
            className="mt-10 w-full orbit-btn"
            onClick={() => {
              void goTo(2);
            }}
          >
            {tCommon("continue")}
          </button>
        </>
      ) : null}

      {step === 2 ? (
        <>
          <h1 className="mt-4 font-[family-name:var(--font-orbit-display)] text-[28px] font-semibold tracking-tight text-[var(--orbit-ink)]">
            {t("step2Title")}
          </h1>
          <p className="mt-3 text-[16px] leading-relaxed text-[var(--orbit-secondary)]">
            {t("step2Body")}
          </p>
          <ChoiceGroup
            className="mt-8"
            label={t("cadenceLabel")}
            value={cadence}
            options={cadenceOptions}
            onChange={(value) => setValue("cadence", value)}
          />

          {cadence === "Twice a month" ? (
            <div className="mt-6 flex flex-wrap items-baseline gap-x-4 gap-y-3 text-[15px] text-[var(--orbit-secondary)]">
              <label>
                {t("firstDay")}
                <select
                  {...register("firstDay", { valueAsNumber: true })}
                  className="ml-2 orbit-field"
                >
                  {PAYDAY_DAY_CHOICES.map((choice) => (
                    <option key={choice.value} value={choice.value}>
                      {choice.value === LAST_DAY_OF_MONTH ? t("lastDay") : choice.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t("secondDay")}
                <select
                  {...register("secondDay", { valueAsNumber: true })}
                  className="ml-2 orbit-field"
                >
                  {PAYDAY_DAY_CHOICES.map((choice) => (
                    <option key={choice.value} value={choice.value}>
                      {choice.value === LAST_DAY_OF_MONTH ? t("lastDay") : choice.label}
                    </option>
                  ))}
                </select>
              </label>
              {errors.secondDay?.message ? (
                <p className="w-full text-[15px] text-[var(--orbit-short)]">
                  {t(errors.secondDay.message as "twoDifferentDays")}
                </p>
              ) : null}
            </div>
          ) : null}

          {cadence === "Every month" ? (
            <label className="mt-6 block text-[15px] text-[var(--orbit-secondary)]">
              {t("monthDay")}
              <select
                {...register("monthDay", { valueAsNumber: true })}
                className="ml-2 orbit-field"
              >
                {PAYDAY_DAY_CHOICES.map((choice) => (
                  <option key={choice.value} value={choice.value}>
                    {choice.value === LAST_DAY_OF_MONTH ? t("lastDay") : choice.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <label className="mt-8 block text-[15px] text-[var(--orbit-secondary)]">
            {cadence === "Twice a month" ? t("startingFrom") : t("nextTime")}
            <input type="date" {...register("nextPayday")} className={FIELD_CLASS} />
          </label>
          {errors.nextPayday ? (
            <p className="mt-2 text-[15px] text-[var(--orbit-short)]">{t("pickDate")}</p>
          ) : null}
          <button
            type="button"
            className="mt-10 w-full orbit-btn"
            onClick={() => {
              void goTo(3);
            }}
          >
            {tCommon("continue")}
          </button>
        </>
      ) : null}

      {step === 3 ? (
        <>
          <h1 className="mt-4 font-[family-name:var(--font-orbit-display)] text-[28px] font-semibold tracking-tight text-[var(--orbit-ink)]">
            {t("step3Title")}
          </h1>
          <p className="mt-2 text-[15px] text-[var(--orbit-secondary)]">
            {cadence === "Twice a month" ? t("step3BodyTwice") : t("step3Body")}
          </p>
          <div className="mt-8 flex items-baseline gap-1">
            <span className="text-3xl">$</span>
            <input
              {...register("amount")}
              className="w-full min-w-0 bg-transparent font-[family-name:var(--font-orbit-display)] text-5xl outline-none"
              inputMode="decimal"
              aria-label={t("paydayAmountAria")}
            />
          </div>
          {errors.amount?.message ? (
            <p className="mt-2 text-[15px] text-[var(--orbit-short)]">
              {t(errors.amount.message as "amountRequired")}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={createTenant.isPending}
            className="mt-10 w-full orbit-btn disabled:opacity-60"
          >
            {t("submit")}
          </button>
        </>
      ) : null}
    </form>
  );
}

export default function CreatePage() {
  const tCommon = useTranslations("common");
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-md px-5 py-16 text-[var(--orbit-secondary)]">
          {tCommon("loading")}
        </div>
      }
    >
      <CreateForm />
    </Suspense>
  );
}
