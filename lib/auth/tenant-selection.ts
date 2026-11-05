import { NextResponse } from "next/server";
import type { TenantChoice } from "@/types/me/me.types";

export const TENANT_SELECTION_CODE = "tenant_selection_required";

/** Thrown when a user has several active memberships and the request names none. */
export class TenantSelectionRequiredError extends Error {
  readonly tenants: TenantChoice[];

  constructor(tenants: TenantChoice[]) {
    super("Tenant selection required");
    this.name = "TenantSelectionRequiredError";
    this.tenants = tenants;
  }
}

export function tenantSelectionResponse(error: TenantSelectionRequiredError): NextResponse {
  return NextResponse.json(
    {
      error: "Choose a household to continue",
      code: TENANT_SELECTION_CODE,
      tenants: error.tenants,
    },
    { status: 400 },
  );
}
