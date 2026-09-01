import { createHmac, timingSafeEqual } from "node:crypto";

// Short-lived signed ticket for /live viewer auth so the browser never holds a long-lived
// secret — mirrors the "don't put the token in the page" precaution from the original
// websocket-server test client. Format: "<expEpochMs>.<hmacHex>".
export function signTicket(secret: string, ttlMs: number): string {
  const exp = Date.now() + ttlMs;
  const sig = createHmac("sha256", secret).update(String(exp)).digest("hex");
  return `${exp}.${sig}`;
}

export function verifyTicket(secret: string, ticket: string): boolean {
  const [expStr, sig] = ticket.split(".");
  if (!expStr || !sig) return false;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || Date.now() > exp) return false;

  const expected = createHmac("sha256", secret).update(expStr).digest("hex");
  const a = Buffer.from(sig, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
