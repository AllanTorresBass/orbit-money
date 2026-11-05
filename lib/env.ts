import { z } from "zod";

const envSchema = z
  .object({
    DATABASE_URL: z.string().min(1),
    DATABASE_URL_UNPOOLED: z.string().min(1),
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    AUTH_SECRET: z.string().optional(),
    CRON_SECRET: z.string().optional(),
    ALLOW_DEV_HEADER_AUTH: z.enum(["true", "false"]).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.NODE_ENV === "production" && (!value.AUTH_SECRET || value.AUTH_SECRET.length < 16)) {
      ctx.addIssue({
        code: "custom",
        path: ["AUTH_SECRET"],
        message: "AUTH_SECRET is required in production (min 16 chars)",
      });
    }
    if (value.NODE_ENV === "production" && value.ALLOW_DEV_HEADER_AUTH === "true") {
      ctx.addIssue({
        code: "custom",
        path: ["ALLOW_DEV_HEADER_AUTH"],
        message: "ALLOW_DEV_HEADER_AUTH must not be enabled in production",
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) {
    return cached;
  }

  const parsed = envSchema.safeParse({
    DATABASE_URL: process.env.DATABASE_URL,
    DATABASE_URL_UNPOOLED: process.env.DATABASE_URL_UNPOOLED,
    NODE_ENV: process.env.NODE_ENV,
    AUTH_SECRET: process.env.AUTH_SECRET,
    CRON_SECRET: process.env.CRON_SECRET,
    ALLOW_DEV_HEADER_AUTH: process.env.ALLOW_DEV_HEADER_AUTH,
  });

  if (!parsed.success) {
    throw new Error(
      `Invalid environment: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}`,
    );
  }

  cached = parsed.data;
  return cached;
}
