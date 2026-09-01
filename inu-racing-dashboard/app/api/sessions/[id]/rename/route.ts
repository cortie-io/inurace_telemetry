import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { db } from "@/db";
import { sessions } from "@/db/schema";
import { broadcastLabEvent } from "@/lib/ingest-client";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { name?: unknown } | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const [updated] = await db
    .update(sessions)
    .set({ name })
    .where(eq(sessions.id, id))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "session not found" }, { status: 404 });
  }

  await broadcastLabEvent({ type: "lab_renamed", sessionId: updated.id, name: updated.name });

  return NextResponse.json({ id: updated.id, name: updated.name });
}
