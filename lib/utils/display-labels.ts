import type { PersonRole } from "@/types/people/people.types";
import type { Cadence } from "@/types/tenant/create-space.types";
import type { TenantType } from "@/types/tenant/tenant.types";

/** The role word a person sees. Never the stored value. */
export const ROLE_LABELS: Record<PersonRole, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
  advisor: "Advisor",
  read_only: "View only",
};

export function roleLabel(role: PersonRole): string {
  return ROLE_LABELS[role];
}

/** One line under each payday rhythm on Create. */
export const CADENCE_HINTS: Record<Cadence, string> = {
  "Every week": "The same weekday.",
  "Every two weeks": "A paycheck every other week.",
  "Twice a month": "Two days in the month.",
  "Every month": "One day each month.",
  "Once a year": "One day each year.",
};

/** One line per role, as shown on Invite and People. */
export const ROLE_DESCRIPTIONS: Record<PersonRole, string> = {
  owner: "Can do everything, including billing",
  admin: "Can edit the plan, the bank, and people",
  member: "Can spend, and can suggest changes",
  advisor: "Can look, and cannot move money",
  read_only: "Can look, and cannot move money",
};

/** First line of the Join screen: "You'll be a member." */
export const JOIN_ROLE_SENTENCES: Record<PersonRole, string> = {
  owner: "You'll be an owner.",
  admin: "You'll be an admin.",
  member: "You'll be a member.",
  advisor: "You'll be an advisor.",
  read_only: "You'll have view only access.",
};

/** Second line of the Join screen: what the role can do. */
export const JOIN_CAPABILITY_SENTENCES: Record<PersonRole, string> = {
  owner: "You can do everything, including billing.",
  admin: "You can edit the plan, the bank, and people.",
  member: "You can add purchases and suggest changes.",
  advisor: "You can look, and you cannot move money.",
  read_only: "You can look, and you cannot move money.",
};

/**
 * Quiet label under the space name. Personal spaces show none: the name is enough.
 */
export function tenantTypeLabel(type: TenantType): string | null {
  switch (type) {
    case "household":
      return "Household";
    case "organization":
      return "Organization";
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
): BillSetAsideLabel {
  if (ceilingCents === null || ceilingCents <= 0) {
    return { text: format(balanceCents), covered: false };
  }
  if (balanceCents >= ceilingCents) {
    return { text: `Set aside ${format(ceilingCents)}`, covered: true };
  }
  return {
    text: `${format(Math.max(0, balanceCents))} of ${format(ceilingCents)} set aside`,
    covered: false,
  };
}
