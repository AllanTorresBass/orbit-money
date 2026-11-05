import type { TenantChoice } from "@/types/me/me.types";

/** Error from an API response, carrying the status and any machine code. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly tenants: TenantChoice[];

  constructor(
    message: string,
    options: { status: number; code?: string | null; tenants?: TenantChoice[] },
  ) {
    super(message);
    this.name = "ApiError";
    this.status = options.status;
    this.code = options.code ?? null;
    this.tenants = options.tenants ?? [];
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}
