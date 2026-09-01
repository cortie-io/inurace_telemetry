// Bridge to inu-telemetry-server, mirroring the x-internal-secret pattern already used
// between network-tutor and network-tutor-web on this box. Postgres stays the source of truth
// (this is called after the DB write already succeeded) — this just tells the ingest server to
// (1) update its in-memory "which session is currently recording" mirror, used to tag incoming
// telemetry, and (2) fan the event out over /live to every connected dashboard viewer, which is
// what keeps Start/Stop/Lab-Time/Reset synced across every screen instead of just the browser
// that clicked the button. Best-effort: a failed push doesn't block the API response, and the
// ingest server also self-recovers open-Lab state on its own restart (loadOpenLab in its db.ts).
export type LabEvent =
  | { type: "lab_started"; sessionId: string; name: string; startedAt: number }
  | { type: "lab_stopped"; sessionId: string }
  | {
      type: "lab_mark";
      sessionId: string;
      bookmark: {
        id: string;
        label: string;
        startTimestamp: number;
        endTimestamp: number;
        startElapsed: number;
        endElapsed: number;
      };
    }
  | { type: "lab_deleted"; sessionId: string }
  | { type: "lab_renamed"; sessionId: string; name: string }
  | { type: "graph_reset" };

export async function broadcastLabEvent(event: LabEvent): Promise<void> {
  const base = process.env.TELEMETRY_INGEST_URL;
  const secret = process.env.INTERNAL_API_SECRET;
  if (!base || !secret) {
    console.error("[ingest-client] TELEMETRY_INGEST_URL / INTERNAL_API_SECRET not set");
    return;
  }
  try {
    const res = await fetch(`${base}/internal/broadcast`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-secret": secret },
      body: JSON.stringify(event),
    });
    if (!res.ok) {
      console.error(`[ingest-client] broadcast push failed: ${res.status}`);
    }
  } catch (err) {
    console.error("[ingest-client] broadcast push failed", err);
  }
}
