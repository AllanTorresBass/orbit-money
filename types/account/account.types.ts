import { z } from "zod";

export interface AccountDto {
  id: string;
  name: string;
  balanceCents: number;
  isEveryday: boolean;
}

export const createAccountBodySchema = z.object({
  name: z.string().trim().min(1).max(100),
  balanceCents: z.number().int(),
});
export type CreateAccountBody = z.infer<typeof createAccountBodySchema>;

export const updateAccountBalanceBodySchema = z.object({
  balanceCents: z.number().int(),
});
export type UpdateAccountBalanceBody = z.infer<typeof updateAccountBalanceBodySchema>;

export interface AccountListResponse {
  accounts: AccountDto[];
}
