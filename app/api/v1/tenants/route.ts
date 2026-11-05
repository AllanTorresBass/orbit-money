import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { tenantService } from "@/lib/services";

const bodySchema = z.object({
  name: z.string().min(1).max(100),
  tenantType: z.enum(["individual", "household", "organization"]),
  ownerEmail: z.string().email(),
  ownerName: z.string().min(1).max(100),
  timezone: z.string().min(1).default("America/New_York"),
  paydayAmountCents: z.number().int().positive(),
  nextPayday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  rrule: z.string().min(1),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const json: unknown = await request.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation failed" }, { status: 400 });
    }
    const created = await tenantService.createHousehold(parsed.data);
    return NextResponse.json(created, { status: 201 });
  } catch (error: unknown) {
    logger.error("POST /tenants failed", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
