import { z } from "zod";

const envSchema = z
  .object({
    DATABASE_URL: z.string().min(1),
    DATABASE_URL_UNPOOLED: z.string().min(1),
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    AUTH_SECRET: z.string().optional(),
    /** Required always — midnight cron authorizes only with Bearer this value. */
    CRON_SECRET: z.string().min(8),
    ALLOW_DEV_HEADER_AUTH: z.enum(["true", "false"]).optional(),
    NEXT_PUBLIC_ALLOW_DEV_HEADER_AUTH: z.enum(["true", "false"]).optional(),
    AUTH_RESEND_KEY: z.string().optional(),
    AUTH_EMAIL_FROM: z.string().email().optional(),
    NEXT_PUBLIC_MAGIC_LINK: z.enum(["true", "false"]).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.NODE_ENV === "production" && (!value.AUTH_SECRET || value.AUTH_SECRET.length < 16)) {
      ctx.addIssue({
        code: "custom",
        path: ["AUTH_SECRET"],
        message: "AUTH_SECRET is required in production (min 16 chars)",
      });
    }
    if (value.NODE_ENV === "production" && value.CRON_SECRET.length < 16) {
      ctx.addIssue({
        code: "custom",
        path: ["CRON_SECRET"],
        message: "CRON_SECRET must be at least 16 characters in production",
      });
    }
    if (
      value.NEXT_PUBLIC_MAGIC_LINK === "true" &&
      (!value.AUTH_RESEND_KEY || !value.AUTH_EMAIL_FROM)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["NEXT_PUBLIC_MAGIC_LINK"],
        message: "NEXT_PUBLIC_MAGIC_LINK=true requires AUTH_RESEND_KEY and AUTH_EMAIL_FROM",
      });
    }
    if (value.NODE_ENV === "production" && value.ALLOW_DEV_HEADER_AUTH === "true") {
      ctx.addIssue({
        code: "custom",
        path: ["ALLOW_DEV_HEADER_AUTH"],
        message: "ALLOW_DEV_HEADER_AUTH must not be enabled in production",
      });
    }
    if (value.NODE_ENV === "production" && value.NEXT_PUBLIC_ALLOW_DEV_HEADER_AUTH === "true") {
      ctx.addIssue({
        code: "custom",
        path: ["NEXT_PUBLIC_ALLOW_DEV_HEADER_AUTH"],
        message: "NEXT_PUBLIC_ALLOW_DEV_HEADER_AUTH must not be enabled in production",
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
    NEXT_PUBLIC_ALLOW_DEV_HEADER_AUTH: process.env.NEXT_PUBLIC_ALLOW_DEV_HEADER_AUTH,
    AUTH_RESEND_KEY: process.env.AUTH_RESEND_KEY,
    AUTH_EMAIL_FROM: process.env.AUTH_EMAIL_FROM,
    NEXT_PUBLIC_MAGIC_LINK: process.env.NEXT_PUBLIC_MAGIC_LINK,
  });

  if (!parsed.success) {
    throw new Error(
      `Invalid environment: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}`,
    );
  }

  cached = parsed.data;
  return cached;
}
