import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { broadcastLabEvent } from "@/lib/ingest-client";

// No DB write — the graph window is ephemeral UI state, not persisted data. This just tells the
// ingest server to relay a graph_reset event to every connected /live viewer, so pressing Reset
// on one screen clears the rolling graph on all of them, not just the one that clicked it.
export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  await broadcastLabEvent({ type: "graph_reset" });
  return NextResponse.json({ ok: true });
}
