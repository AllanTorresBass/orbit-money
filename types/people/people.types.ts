import { z } from "zod";
import { entityIdSchema } from "@/types/shared/ids";

export const membershipRoleSchema = z.enum(["owner", "admin", "member", "read_only", "advisor"]);
export type PersonRole = z.infer<typeof membershipRoleSchema>;

/** Roles an owner or admin may hand out. Owner is never assigned here. */
export const assignableRoleSchema = z.enum(["admin", "member", "advisor", "read_only"]);
export type AssignableRole = z.infer<typeof assignableRoleSchema>;

export const membershipStatusSchema = z.enum(["invited", "active", "suspended"]);
export type MembershipStatus = z.infer<typeof membershipStatusSchema>;

export interface PersonDto {
  userId: string;
  name: string;
  email: string;
  role: PersonRole;
  status: MembershipStatus;
}

export const inviteBodySchema = z.object({
  email: z.string().email(),
  name: z.string().trim().min(1).max(100),
  role: assignableRoleSchema,
});
export type InviteBody = z.infer<typeof inviteBodySchema>;

export const updateRoleBodySchema = z.object({
  role: assignableRoleSchema,
});
export type UpdateRoleBody = z.infer<typeof updateRoleBodySchema>;

export const personParamSchema = z.object({
  userId: entityIdSchema,
});

export const acceptInviteBodySchema = z.object({
  tenantId: entityIdSchema.optional(),
});
export type AcceptInviteBody = z.infer<typeof acceptInviteBodySchema>;

export interface PeopleListResponse {
  people: PersonDto[];
}

export interface InviteResult {
  userId: string;
  status: MembershipStatus;
}
