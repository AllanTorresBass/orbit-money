import { z } from "zod";

const emailSchema = z.string().trim().toLowerCase().pipe(z.email());

export interface OwnerIdentity {
  email: string;
  name: string;
}

function validEmail(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = emailSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function nameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "";
  const words = local.split(/[._-]+/).filter(Boolean);
  if (words.length === 0) return "Owner";
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ").slice(0, 100);
}

/**
 * Owner identity for Create. Prefers the `?email=` the sign-in page passed along,
 * then the signed-in session email, and only then a placeholder `@orbit.local` address.
 */
export function resolveOwnerEmail(input: {
  queryEmail: string | null;
  sessionEmail: string | null;
  spaceName: string;
}): OwnerIdentity {
  const real = validEmail(input.queryEmail) ?? validEmail(input.sessionEmail);
  if (real) {
    return { email: real, name: nameFromEmail(real) };
  }
  const slug = input.spaceName.toLowerCase().replace(/\s+/g, ".") || "owner";
  return { email: `${slug}@orbit.local`, name: "Owner" };
}
