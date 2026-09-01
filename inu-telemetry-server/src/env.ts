function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing required env var ${name} (check .env.local)`);
    process.exit(1);
  }
  return v;
}

function int(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export const env = {
  port: int("PORT", 8090),
  databaseUrl: required("DATABASE_URL"),
  wsTicketSecret: required("WS_TICKET_SECRET"),
  internalApiSecret: required("INTERNAL_API_SECRET"),
  flushIntervalMs: int("FLUSH_INTERVAL_MS", 200),
  flushMaxRows: int("FLUSH_MAX_ROWS", 500),
  bufferHardCap: int("BUFFER_HARD_CAP", 20_000),
  heartbeatIntervalMs: int("HEARTBEAT_INTERVAL_MS", 5_000),
  authTimeoutMs: int("AUTH_TIMEOUT_MS", 15_000),
  ticketTtlMs: int("TICKET_TTL_MS", 30_000),
};
