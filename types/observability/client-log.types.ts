import { z } from "zod";

/** Levels a browser may report. Errors are reported as `warn`; the server owns `error`. */
export const clientLogLevelSchema = z.enum(["info", "warn"]);
export type ClientLogLevel = z.infer<typeof clientLogLevelSchema>;

/** One line the browser wants in the server log. Never carries amounts, names, or emails. */
export const clientLogBodySchema = z.object({
  level: clientLogLevelSchema,
  message: z.string().trim().min(1).max(300),
  /** The screen it happened on, e.g. `/plan`. */
  route: z.string().trim().max(200).optional(),
});
export type ClientLogBody = z.infer<typeof clientLogBodySchema>;
