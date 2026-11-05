import { HARBOR } from "@/lib/dev/harbor-ids";

/** Stable Harbor seed IDs for the browser API client. */
export const HARBOR_DEFAULTS = {
  tenantId: HARBOR.tenantId,
  alexId: HARBOR.alexId,
  blairId: HARBOR.blairId,
  caseyId: HARBOR.caseyId,
} as const;
