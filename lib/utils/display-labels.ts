import type { PersonRole } from "@/types/people/people.types";
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
