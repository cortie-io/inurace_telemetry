import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { db } from "@/db";
import { bookmarks } from "@/db/schema";
import { broadcastLabEvent } from "@/lib/ingest-client";

const bookmarkBody = z
  .object({
    label: z.string().trim().min(1).max(200),
    startTs: z.number(),
    endTs: z.number(),
    startElapsedMs: z.number().min(0),
    endElapsedMs: z.number().min(0),
  })
  .refine((b) => b.endTs > b.startTs, { message: "endTs must be after startTs" });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const parsed = bookmarkBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const [created] = await db
    .insert(bookmarks)
    .values({
      sessionId: id,
      label: parsed.data.label,
      startTs: new Date(parsed.data.startTs),
      endTs: new Date(parsed.data.endTs),
      startElapsedMs: Math.round(parsed.data.startElapsedMs),
      endElapsedMs: Math.round(parsed.data.endElapsedMs),
    })
    .returning();

  const bookmark = {
    id: created.id,
    label: created.label,
    startTimestamp: created.startTs.getTime(),
    endTimestamp: created.endTs.getTime(),
    startElapsed: created.startElapsedMs,
    endElapsed: created.endElapsedMs,
  };

  await broadcastLabEvent({ type: "lab_mark", sessionId: id, bookmark });

  return NextResponse.json(bookmark);
}
