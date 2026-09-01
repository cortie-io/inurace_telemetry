import "./loadEnv.js";

import { createServer, type IncomingMessage } from "node:http";
import { WebSocket, WebSocketServer, type RawData } from "ws";
import { env } from "./env.js";
import {
  type ActiveLab,
  authenticateDevice,
  BatchWriter,
  compactOldSamples,
  deleteExpiredSamples,
  ensurePartitionsAround,
  type LabBookmark,
  loadBookmarksForSession,
  loadDeviceLastSeen,
  loadOpenLab,
  pool,
  touchDeviceLastSeen,
} from "./db.js";
import { deviceInboundMessage, liveInboundMessage } from "./protocol.js";
import { verifyTicket } from "./ticket.js";

const batchWriter = new BatchWriter({
  intervalMs: env.flushIntervalMs,
  maxRows: env.flushMaxRows,
  hardCap: env.bufferHardCap,
});

// The single Lab (session) currently recording, if any, and its marks so far — this is what
// makes every connected dashboard viewer see the same Start/Stop/Lab-Time state instead of each
// browser tracking it independently. Mutated only by /internal/broadcast (the Next.js app is the
// one writing to Postgres; this is just the in-memory mirror + fan-out to /live viewers).
let activeLab: ActiveLab | null = null;
let activeLabBookmarks: LabBookmark[] = [];

type BroadcastEvent =
  | { type: "lab_started"; sessionId: string; name: string; startedAt: number }
  | { type: "lab_stopped"; sessionId: string }
  | { type: "lab_mark"; sessionId: string; bookmark: LabBookmark }
  | { type: "lab_deleted"; sessionId: string }
  | { type: "lab_renamed"; sessionId: string; name: string }
  | { type: "graph_reset" };

interface DeviceClientState {
  authenticated: boolean;
  deviceId?: string;
  deviceKey?: string;
  isAlive: boolean;
  rejectedCount: number;
}

interface LiveClientState {
  authenticated: boolean;
  isAlive: boolean;
}

const deviceClients = new Map<WebSocket, DeviceClientState>();
const liveClients = new Map<WebSocket, LiveClientState>();

// Connection state is tracked separately from telemetry itself: a /live viewer's own WS staying
// open says nothing about whether the car is still connected on /device. deviceLastSeen persists
// across a device's disconnects (seeded from devices.last_seen_at on boot) so "last seen Xs ago"
// stays meaningful even right after a server restart or while the car is offline.
const deviceLastSeen = new Map<string, number | null>();

// When the device's *current, still-open* connection was authenticated — not persisted across
// restarts like deviceLastSeen, since a fresh connection after a restart is a genuinely new
// connection. Only meaningful while the device is online; cleared on disconnect so a viewer can't
// show a stale "connected for Xh" after the car actually dropped.
const deviceConnectedAt = new Map<string, number>();

function isDeviceOnline(deviceKey: string): boolean {
  for (const state of deviceClients.values()) {
    if (state.authenticated && state.deviceKey === deviceKey) return true;
  }
  return false;
}

function deviceStatusPayload(deviceKey: string) {
  return {
    type: "device_status",
    deviceKey,
    online: isDeviceOnline(deviceKey),
    lastSeenAt: deviceLastSeen.get(deviceKey) ?? null,
    connectedAt: deviceConnectedAt.get(deviceKey) ?? null,
  };
}

function broadcastDeviceStatus(deviceKey: string): void {
  broadcastToLive(deviceStatusPayload(deviceKey));
}

function send(ws: WebSocket, payload: unknown): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(payload));
}

function broadcastToLive(payload: unknown): void {
  const data = JSON.stringify(payload);
  for (const [ws, state] of liveClients) {
    if (state.authenticated && ws.readyState === ws.OPEN) ws.send(data);
  }
}

// --- HTTP: health check + internal broadcast bridge from the Next.js app ---
// The Next.js app owns writing to Postgres (sessions/bookmarks); after each write it posts here
// so this process can update its in-memory activeLab mirror (needed to tag incoming telemetry
// with the right session_id) and fan the event out to every connected /live dashboard viewer —
// that's what keeps Start/Stop/Lab-Time/Reset synced across every screen watching the car.
const server = createServer((req, res) => {
  if (req.method === "GET" && req.url === "/healthz") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "ok",
        bufferedSamples: batchWriter.bufferedCount,
        deviceClients: deviceClients.size,
        liveClients: liveClients.size,
        activeLabSessionId: activeLab?.sessionId ?? null,
      }),
    );
    return;
  }

  if (req.method === "POST" && req.url === "/internal/broadcast") {
    if (req.headers["x-internal-secret"] !== env.internalApiSecret) {
      res.writeHead(403).end("Forbidden");
      return;
    }
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const event = JSON.parse(body) as BroadcastEvent;
        applyBroadcastEvent(event);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      } catch {
        res.writeHead(400).end("Bad Request");
      }
    });
    return;
  }

  res.writeHead(404).end("Not found");
});

function applyBroadcastEvent(event: BroadcastEvent): void {
  if (event.type === "lab_started") {
    activeLab = { sessionId: event.sessionId, name: event.name, startedAt: event.startedAt };
    activeLabBookmarks = [];
    console.log(`[lab] started ${event.sessionId} (${event.name})`);
  } else if (event.type === "lab_stopped") {
    if (activeLab?.sessionId === event.sessionId) {
      activeLab = null;
      activeLabBookmarks = [];
    }
    console.log(`[lab] stopped ${event.sessionId}`);
  } else if (event.type === "lab_mark") {
    if (activeLab?.sessionId === event.sessionId) {
      activeLabBookmarks = [...activeLabBookmarks, event.bookmark];
    }
  } else if (event.type === "lab_renamed") {
    if (activeLab?.sessionId === event.sessionId) {
      activeLab = { ...activeLab, name: event.name };
    }
  }
  broadcastToLive(event);
}

const deviceWss = new WebSocketServer({ noServer: true });
const liveWss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req: IncomingMessage, socket, head) => {
  const { pathname } = new URL(req.url ?? "/", "http://internal");
  if (pathname === "/device") {
    deviceWss.handleUpgrade(req, socket, head, (ws) => deviceWss.emit("connection", ws, req));
  } else if (pathname === "/live") {
    liveWss.handleUpgrade(req, socket, head, (ws) => liveWss.emit("connection", ws, req));
  } else {
    socket.destroy();
  }
});

// --- /device: hardware ingest ---
deviceWss.on("connection", (ws: WebSocket) => {
  const state: DeviceClientState = { authenticated: false, isAlive: true, rejectedCount: 0 };
  deviceClients.set(ws, state);

  ws.on("pong", () => {
    state.isAlive = true;
  });

  const authTimer = setTimeout(() => {
    if (!state.authenticated) {
      send(ws, { type: "auth_error", text: "auth timeout" });
      ws.terminate();
    }
  }, env.authTimeoutMs);

  ws.on("message", (raw: RawData) => {
    let json: unknown;
    try {
      json = JSON.parse(raw.toString());
    } catch {
      send(ws, { type: "error", text: "invalid JSON" });
      return;
    }

    if (!state.authenticated) {
      const parsed = deviceInboundMessage.safeParse(json);
      if (!parsed.success || parsed.data.type !== "auth") {
        send(ws, { type: "auth_error", text: "first message must be auth" });
        ws.terminate();
        return;
      }
      const authMsg = parsed.data;
      void (async () => {
        const device = await authenticateDevice(authMsg.deviceKey, authMsg.token);
        if (!device) {
          send(ws, { type: "auth_error", text: "invalid device key or token" });
          ws.terminate();
          return;
        }
        state.authenticated = true;
        state.deviceId = device.id;
        state.deviceKey = device.deviceKey;
        clearTimeout(authTimer);
        deviceLastSeen.set(device.deviceKey, Date.now());
        deviceConnectedAt.set(device.deviceKey, Date.now());
        void touchDeviceLastSeen(device.id);
        console.log(`[device] ${device.deviceKey} connected (${deviceClients.size} device clients)`);
        send(ws, { type: "welcome", deviceKey: device.deviceKey, time: Date.now() });
        broadcastDeviceStatus(device.deviceKey);
      })();
      return;
    }

    const parsed = deviceInboundMessage.safeParse(json);
    if (!parsed.success || parsed.data.type !== "telemetry") {
      // A connected-but-silent device was previously indistinguishable from one sending data
      // that just fails validation — this was invisible in the logs either way. Log the first
      // rejection immediately, then every 100th after that, so a bad-data stream doesn't flood
      // the log but is never fully silent either.
      state.rejectedCount++;
      if (state.rejectedCount % 100 === 1) {
        const reason = !parsed.success ? parsed.error.message : `unexpected type "${parsed.data.type}"`;
        console.warn(
          `[device] ${state.deviceKey} sent an invalid/unexpected message (${state.rejectedCount} rejected so far): ${reason}`,
        );
      }
      send(ws, { type: "error", text: "expected telemetry message" });
      return;
    }
    const t = parsed.data;
    const now = new Date();
    deviceLastSeen.set(state.deviceKey!, now.getTime());

    batchWriter.push({
      time: now,
      deviceId: state.deviceId!,
      sessionId: activeLab?.sessionId ?? null,
      steeringAngle: t.steeringAngle,
      brakeFront: t.brakeFront,
      brakeRear: t.brakeRear,
      speed: t.speed,
      batteryTemp: t.batteryTemp,
      batteryVoltage: t.batteryVoltage,
      batteryCurrent: t.batteryCurrent,
      rtd: t.rtd,
      precharge: t.preCharge,
    });

    broadcastToLive({
      type: "telemetry",
      deviceKey: state.deviceKey,
      time: now.getTime(),
      steeringAngle: t.steeringAngle,
      brakeFront: t.brakeFront,
      brakeRear: t.brakeRear,
      speed: t.speed,
      batteryTemp: t.batteryTemp,
      batteryVoltage: t.batteryVoltage,
      batteryCurrent: t.batteryCurrent,
      rtd: t.rtd,
      preCharge: t.preCharge,
    });
  });

  ws.on("close", () => {
    clearTimeout(authTimer);
    deviceClients.delete(ws);
    if (state.deviceKey) {
      deviceConnectedAt.delete(state.deviceKey);
      console.log(`[device] ${state.deviceKey} disconnected (${deviceClients.size} device clients)`);
      broadcastDeviceStatus(state.deviceKey);
    }
  });

  ws.on("error", (err) => console.error("[device ws error]", err.message));
});

// --- /live: dashboard viewers ---
liveWss.on("connection", (ws: WebSocket) => {
  const state: LiveClientState = { authenticated: false, isAlive: true };
  liveClients.set(ws, state);

  ws.on("pong", () => {
    state.isAlive = true;
  });

  const authTimer = setTimeout(() => {
    if (!state.authenticated) {
      send(ws, { type: "auth_error", text: "auth timeout" });
      ws.terminate();
    }
  }, env.authTimeoutMs);

  ws.on("message", (raw: RawData) => {
    if (state.authenticated) return; // /live is receive-only for viewers past auth

    let json: unknown;
    try {
      json = JSON.parse(raw.toString());
    } catch {
      send(ws, { type: "error", text: "invalid JSON" });
      return;
    }

    const parsed = liveInboundMessage.safeParse(json);
    if (!parsed.success || !verifyTicket(env.wsTicketSecret, parsed.data.ticket)) {
      send(ws, { type: "auth_error", text: "invalid or expired ticket" });
      ws.terminate();
      return;
    }

    state.authenticated = true;
    clearTimeout(authTimer);
    send(ws, { type: "welcome", time: Date.now() });
    // So a viewer that just connected doesn't have to wait for the next connect/disconnect
    // transition to know current state — send it for every known device right away.
    for (const deviceKey of deviceLastSeen.keys()) {
      send(ws, deviceStatusPayload(deviceKey));
    }
    // Same idea for recording state: a freshly-connected (or reconnected) viewer needs to know
    // right away whether a Lab is currently running and what's been marked in it so far, not
    // just future changes — this is what keeps every screen in sync, not only ones that were
    // already open when the Start/Mark/Stop happened.
    send(ws, { type: "lab_state", active: activeLab, bookmarks: activeLabBookmarks });
  });

  ws.on("close", () => {
    clearTimeout(authTimer);
    liveClients.delete(ws);
  });

  ws.on("error", (err) => console.error("[live ws error]", err.message));
});

// Ping every env.heartbeatIntervalMs to (1) reap dead connections, (2) avoid idle-timeout
// disconnects from any fronting proxy — same reasoning as the original websocket-server.
function heartbeat(clients: Map<WebSocket, { isAlive: boolean }>): void {
  for (const [ws, state] of clients) {
    if (!state.isAlive) {
      ws.terminate();
      continue;
    }
    state.isAlive = false;
    ws.ping();
  }
}
setInterval(() => {
  heartbeat(deviceClients);
  heartbeat(liveClients);
}, env.heartbeatIntervalMs);

// Ensure today's + tomorrow's partition exist on boot, then re-check every 6h (idempotent).
async function startup(): Promise<void> {
  await ensurePartitionsAround(new Date());
  setInterval(() => void ensurePartitionsAround(new Date()), 6 * 60 * 60 * 1000);

  async function runCompaction() {
    try {
      const { rowsCompacted, bucketsWritten } = await compactOldSamples();
      if (rowsCompacted > 0) {
        console.log(
          `[compaction] rolled up ${rowsCompacted} raw samples older than 1 day into ${bucketsWritten} 1s buckets`,
        );
      }
    } catch (err) {
      console.error("[compaction] rollup failed", err);
    }
  }
  await runCompaction();
  setInterval(() => void runCompaction(), 3 * 60 * 60 * 1000);

  async function runRetention() {
    try {
      const deleted = await deleteExpiredSamples();
      if (deleted > 0) console.log(`[retention] deleted ${deleted} samples past the 3-month window`);
    } catch (err) {
      console.error("[retention] cleanup failed", err);
    }
  }
  await runRetention();
  setInterval(() => void runRetention(), 24 * 60 * 60 * 1000);

  activeLab = await loadOpenLab();
  if (activeLab) {
    activeLabBookmarks = await loadBookmarksForSession(activeLab.sessionId);
    console.log(`[startup] resumed open Lab ${activeLab.sessionId} (${activeLabBookmarks.length} marks)`);
  }

  for (const [deviceKey, lastSeenAt] of await loadDeviceLastSeen()) {
    deviceLastSeen.set(deviceKey, lastSeenAt);
  }

  server.listen(env.port, () => {
    console.log(`inu-telemetry-server listening on :${env.port} (/device, /live, /healthz)`);
  });
}

void startup();

async function shutdown(signal: string): Promise<void> {
  console.log(`[shutdown] ${signal} received, flushing buffered samples...`);
  await batchWriter.shutdown();
  await pool.end();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
