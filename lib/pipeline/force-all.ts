/** Header that must accompany `?all=1` (on top of the Bearer secret) to force every tenant. */
export const FORCE_ALL_HEADER = "x-orbit-force-all";

export type ForceAllDecision = "off" | "forced" | "rejected";

/**
 * `?all=1` runs every tenant, so a stray query string must not trigger it. It needs the
 * confirmation header too. The Bearer check happens before this and is not repeated here.
 */
export function decideForceAll(input: {
  allParam: string | null;
  headerValue: string | null;
}): ForceAllDecision {
  if (input.allParam !== "1") return "off";
  return input.headerValue === "1" ? "forced" : "rejected";
}
