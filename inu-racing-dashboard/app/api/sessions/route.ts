import { asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { db } from "@/db";
import { bookmarks, devices, sessions } from "@/db/schema";
import { broadcastLabEvent } from "@/lib/ingest-client";

const DEFAULT_RANGE_MS = 7 * 24 * 60 * 60 * 1000;

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const rangeMsParam = req.nextUrl.searchParams.get("rangeMs");
  const rangeMs = rangeMsParam ? Number(rangeMsParam) : DEFAULT_RANGE_MS;
  const from = new Date(Date.now() - (Number.isFinite(rangeMs) ? rangeMs : DEFAULT_RANGE_MS));

  const rows = await db
    .select()
    .from(sessions)
    .where(gte(sessions.startedAt, from))
    .orderBy(desc(sessions.startedAt))
    .limit(100);

  const sessionIds = rows.map((r) => r.id);
  const bookmarkRows = sessionIds.length
    ? await db
        .select()
        .from(bookmarks)
        .where(inArray(bookmarks.sessionId, sessionIds))
        .orderBy(asc(bookmarks.startTs))
    : [];

  const bookmarksBySession = new Map<string, typeof bookmarkRows>();
  for (const b of bookmarkRows) {
    const list = bookmarksBySession.get(b.sessionId) ?? [];
    list.push(b);
    bookmarksBySession.set(b.sessionId, list);
  }

  const result = rows.map((s) => {
    const startedAtMs = s.startedAt.getTime();
    const endedAtMs = s.endedAt?.getTime() ?? Date.now();
    return {
      id: s.id,
      name: s.name,
      startedAt: startedAtMs,
      endedAt: endedAtMs,
      durationMs: endedAtMs - startedAtMs,
      maxSpeed: s.maxSpeed,
      maxBatteryTemp: s.maxBatteryTemp,
      bookmarks: (bookmarksBySession.get(s.id) ?? []).map((b) => ({
        id: b.id,
        label: b.label,
        startTimestamp: b.startTs.getTime(),
        endTimestamp: b.endTs.getTime(),
        startElapsed: b.startElapsedMs,
        endElapsed: b.endElapsedMs,
      })),
    };
  });

  return NextResponse.json(result);
}

export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Single-car team today — the one seeded device is the recording target. Multi-device
  // selection would be a real feature to add if a second car ever gets wired up.
  const [device] = await db.select().from(devices).orderBy(asc(devices.createdAt)).limit(1);
  if (!device) {
    return NextResponse.json({ error: "no device registered" }, { status: 500 });
  }

  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(sessions);
  const name = `Session ${count + 1}`;

  const [created] = await db
    .insert(sessions)
    .values({ deviceId: device.id, name, createdBy: session.user.id })
    .returning();

  await broadcastLabEvent({
    type: "lab_started",
    sessionId: created.id,
    name: created.name,
    startedAt: created.startedAt.getTime(),
  });

  return NextResponse.json({
    id: created.id,
    name: created.name,
    startedAt: created.startedAt.getTime(),
  });
}
