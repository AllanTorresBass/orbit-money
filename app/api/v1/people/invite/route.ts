import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolveSession } from "@/lib/auth/session";
import { logger } from "@/lib/logger";
import { peopleService } from "@/lib/services";

const bodySchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
  role: z.enum(["admin", "member", "advisor", "read_only"]),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await resolveSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const json: unknown = await request.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation failed" }, { status: 400 });
    }

    const result = await peopleService.invite({
      tenantId: session.tenantId,
      userId: session.userId,
      role: session.role,
      email: parsed.data.email,
      name: parsed.data.name,
      inviteRole: parsed.data.role,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "unknown";
    if (message === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    logger.error("POST /people/invite failed", { error: message });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
