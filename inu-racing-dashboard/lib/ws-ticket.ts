import { createHmac } from "node:crypto";

// Same HMAC ticket scheme as inu-telemetry-server/src/ticket.ts — must stay in sync (both read
// WS_TICKET_SECRET from their own .env.local, values must match). 30s default TTL: long enough
// to cover the fetch-then-connect round trip, short enough that a leaked ticket is useless.
export function signTicket(ttlMs = 30_000): string {
  const secret = process.env.WS_TICKET_SECRET;
  if (!secret) throw new Error("WS_TICKET_SECRET is not set (check .env.local)");
  const exp = Date.now() + ttlMs;
  const sig = createHmac("sha256", secret).update(String(exp)).digest("hex");
  return `${exp}.${sig}`;
}
