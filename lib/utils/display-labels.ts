import type { PersonRole } from "@/types/people/people.types";
import type { Cadence } from "@/types/tenant/create-space.types";
import type { TenantType } from "@/types/tenant/tenant.types";

type Translate = (key: string, values?: Record<string, string | number>) => string;

/** The role word a person sees. Never the stored value. */
export function roleLabel(role: PersonRole, t: Translate): string {
  return t(role);
}

export function roleDescription(role: PersonRole, t: Translate): string {
  return t(`desc.${role}`);
}

export function joinRoleSentence(role: PersonRole, t: Translate): string {
  return t(`join.${role}`);
}

export function joinCapabilitySentence(role: PersonRole, t: Translate): string {
  return t(`joinCap.${role}`);
}

export function cadenceLabel(cadence: Cadence, t: Translate): string {
  return t(cadence);
}

export function cadenceHint(cadence: Cadence, t: Translate): string {
  return t(`hint.${cadence}`);
}

/**
 * Quiet label under the space name. Personal spaces show none: the name is enough.
 */
export function tenantTypeLabel(type: TenantType, t: Translate): string | null {
  switch (type) {
    case "household":
      return t("household");
    case "organization":
      return t("organization");
    default:
      return null;
  }
}

/** How a bill reads on Plan: covered, partly covered, or no ceiling to compare against. */
export interface BillSetAsideLabel {
  text: string;
  /** True when the ceiling is covered. Covered bills read in secondary text, short ones in ink. */
  covered: boolean;
}

/**
 * "Set aside $1,200" once the bill's ceiling is covered; "$40 of $1,200 set aside" while it
 * is still filling (docs/ui/02-visual-design.md). A bill with no ceiling shows its balance.
 */
export function billSetAsideLabel(
  balanceCents: number,
  ceilingCents: number | null,
  format: (cents: number) => string,
  t: Translate,
): BillSetAsideLabel {
  if (ceilingCents === null || ceilingCents <= 0) {
    return { text: format(balanceCents), covered: false };
  }
  if (balanceCents >= ceilingCents) {
    return { text: t("setAsideCovered", { amount: format(ceilingCents) }), covered: true };
  }
  return {
    text: t("setAsidePartial", {
      partial: format(Math.max(0, balanceCents)),
      total: format(ceilingCents),
    }),
    covered: false,
  };
}

/** @deprecated Prefer roleLabel(role, t). Kept for tests that assert English keys. */
export const ROLE_LABELS: Record<PersonRole, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
  advisor: "Advisor",
  read_only: "View only",
};

/** @deprecated Prefer cadenceHint(cadence, t). */
export const CADENCE_HINTS: Record<Cadence, string> = {
  "Every week": "The same weekday.",
  "Every two weeks": "A paycheck every other week.",
  "Twice a month": "Two days in the month.",
  "Every month": "One day each month.",
  "Once a year": "One day each year.",
};

/** @deprecated Prefer roleDescription(role, t). */
export const ROLE_DESCRIPTIONS: Record<PersonRole, string> = {
  owner: "Can do everything, including billing",
  admin: "Can edit the plan, the bank, and people",
  member: "Can spend, and can suggest changes",
  advisor: "Can look, and cannot move money",
  read_only: "Can look, and cannot move money",
};

/** @deprecated Prefer joinRoleSentence(role, t). */
export const JOIN_ROLE_SENTENCES: Record<PersonRole, string> = {
  owner: "You'll be an owner.",
  admin: "You'll be an admin.",
  member: "You'll be a member.",
  advisor: "You'll be an advisor.",
  read_only: "You'll have view only access.",
};

/** @deprecated Prefer joinCapabilitySentence(role, t). */
export const JOIN_CAPABILITY_SENTENCES: Record<PersonRole, string> = {
  owner: "You can do everything, including billing.",
  admin: "You can edit the plan, the bank, and people.",
  member: "You can add purchases and suggest changes.",
  advisor: "You can look, and you cannot move money.",
  read_only: "You can look, and you cannot move money.",
};
