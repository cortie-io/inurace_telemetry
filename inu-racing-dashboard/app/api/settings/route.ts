import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { db } from "@/db";
import { settings } from "@/db/schema";

async function loadOrCreate() {
  const existing = await db.query.settings.findFirst({ where: eq(settings.id, 1) });
  if (existing) return existing;
  const [created] = await db.insert(settings).values({ id: 1 }).returning();
  return created;
}

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const row = await loadOrCreate();
  return NextResponse.json({
    batteryTempMax: row.batteryTempMax,
    batteryVoltageMax: row.batteryVoltageMax,
    batteryCurrentMax: row.batteryCurrentMax,
  });
}

const updateBody = z.object({
  batteryTempMax: z.number().min(-40).max(200),
  batteryVoltageMax: z.number().min(0).max(1000),
  batteryCurrentMax: z.number().min(0).max(1000),
});

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const parsed = updateBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  await loadOrCreate(); // make sure the singleton row exists before updating it
  const [updated] = await db
    .update(settings)
    .set({ ...parsed.data, updatedAt: new Date(), updatedBy: session.user.id })
    .where(eq(settings.id, 1))
    .returning();

  return NextResponse.json({
    batteryTempMax: updated.batteryTempMax,
    batteryVoltageMax: updated.batteryVoltageMax,
    batteryCurrentMax: updated.batteryCurrentMax,
  });
}
