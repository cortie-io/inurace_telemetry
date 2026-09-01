import { and, eq, isNull } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { db } from "@/db";
import { sessions } from "@/db/schema";
import { querySessionPeaks, unlinkSessionFromTelemetry } from "@/db/telemetry";
import { broadcastLabEvent } from "@/lib/ingest-client";

export async function PATCH(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Peaks come from telemetry_samples, not the client — with multiple viewers able to watch (and
  // now stop) the same Lab, whichever browser clicks Stop only knows what it personally observed
  // since it connected, which is wrong the moment more than one screen is open (see
  // db/telemetry.ts's querySessionPeaks).
  const peaks = await querySessionPeaks(id);

  // ended_at IS NULL guard: only a currently-open session can be stopped, so a duplicate
  // stop request (double-click, retry) is a harmless no-op instead of overwriting real data.
  const [updated] = await db
    .update(sessions)
    .set({
      endedAt: new Date(),
      maxSpeed: peaks.maxSpeed,
      maxBatteryTemp: peaks.maxBatteryTemp,
    })
    .where(and(eq(sessions.id, id), isNull(sessions.endedAt)))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "session not found or already ended" }, { status: 404 });
  }

  await broadcastLabEvent({ type: "lab_stopped", sessionId: updated.id });

  return NextResponse.json({
    id: updated.id,
    name: updated.name,
    startedAt: updated.startedAt.getTime(),
    endedAt: updated.endedAt!.getTime(),
    durationMs: updated.endedAt!.getTime() - updated.startedAt.getTime(),
    maxSpeed: updated.maxSpeed,
    maxBatteryTemp: updated.maxBatteryTemp,
  });
}

// The client-side UI requires a second confirmation click before this ever fires — nothing
// server-side re-confirms, this route just does the delete once asked.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Raw telemetry rows aren't deleted, just detached — the FK would otherwise block removing
  // the session, and there's no reason to lose real sensor readings over a label.
  await unlinkSessionFromTelemetry(id);
  const [deleted] = await db.delete(sessions).where(eq(sessions.id, id)).returning();

  if (!deleted) {
    return NextResponse.json({ error: "session not found" }, { status: 404 });
  }
  await broadcastLabEvent({ type: "lab_deleted", sessionId: deleted.id });
  return NextResponse.json({ ok: true });
}
