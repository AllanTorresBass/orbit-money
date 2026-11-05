import { z } from "zod";

/** Accepts any 8-4-4-4-12 hex id. Zod's strict `uuid()` rejects seeded Harbor ids. */
export const entityIdSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "Invalid id");
