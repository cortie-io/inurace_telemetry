// Stand-in for real ESP32 hardware: connects to /device with a seeded device token and
// streams realistic sine-wave telemetry at high frequency, to exercise the batching/
// backpressure path end-to-end without needing the actual car.
//
// Usage: DEVICE_KEY=esp32-01 DEVICE_TOKEN=... WS_URL=ws://localhost:8090/device \
//        INTERVAL_MS=10 npm run simulate
import "../src/loadEnv.js";
import { WebSocket } from "ws";

const WS_URL = process.env.WS_URL ?? "ws://localhost:8090/device";
const DEVICE_KEY = process.env.DEVICE_KEY;
const DEVICE_TOKEN = process.env.DEVICE_TOKEN;
const INTERVAL_MS = Number(process.env.INTERVAL_MS ?? 10);
const DURATION_MS = Number(process.env.DURATION_MS ?? 30_000);

if (!DEVICE_KEY || !DEVICE_TOKEN) {
  console.error("Set DEVICE_KEY and DEVICE_TOKEN env vars (printed by the seed script).");
  process.exit(1);
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

const ws = new WebSocket(WS_URL);
let phase = 0;
let sent = 0;
let sendTimer: ReturnType<typeof setInterval> | null = null;

ws.on("open", () => {
  console.log(`[sim] connected to ${WS_URL}, authenticating as ${DEVICE_KEY}`);
  ws.send(JSON.stringify({ type: "auth", deviceKey: DEVICE_KEY, token: DEVICE_TOKEN }));
});

ws.on("message", (raw) => {
  const msg = JSON.parse(raw.toString());
  if (msg.type === "welcome") {
    console.log(`[sim] authenticated, streaming every ${INTERVAL_MS}ms for ${DURATION_MS}ms`);
    sendTimer = setInterval(() => {
      phase += 0.08;
      const p = phase;
      const throttling = Math.cos(p * 0.6) > 0;
      const speed = clamp(70 + Math.sin(p * 0.6) * 55 + Math.sin(p * 1.7) * 12, 0, 150);
      const brakeFront = throttling
        ? clamp(Math.random() * 6, 0, 100)
        : clamp(40 + Math.abs(Math.sin(p * 1.3)) * 55, 0, 100);
      const brakeRear = throttling ? clamp(Math.random() * 4, 0, 100) : clamp(brakeFront * 0.82, 0, 100);
      const steeringAngle = clamp(Math.sin(p * 0.9) * 140, -180, 180);
      const batteryCurrent = clamp((throttling ? 220 : 40) + Math.sin(p * 1.1) * 90 + Math.random() * 20, 0, 400);
      const batteryVoltage = clamp(96 - (batteryCurrent / 400) * 14 + Math.sin(p * 0.3) * 1.5, 0, 100);
      const batteryTemp = clamp(34 + Math.sin(p * 0.15) * 10 + (batteryCurrent / 400) * 26, 0, 80);

      ws.send(
        JSON.stringify({
          type: "telemetry",
          steeringAngle,
          brakeFront,
          brakeRear,
          speed,
          batteryTemp,
          batteryVoltage,
          batteryCurrent,
          rtd: true,
          preCharge: p % 8 < 1.2,
        }),
      );
      sent++;
    }, INTERVAL_MS);

    setTimeout(() => {
      if (sendTimer) clearInterval(sendTimer);
      console.log(`[sim] done, sent ${sent} samples`);
      ws.close();
      process.exit(0);
    }, DURATION_MS);
  } else if (msg.type === "auth_error") {
    console.error(`[sim] auth failed: ${msg.text}`);
    process.exit(1);
  }
});

ws.on("error", (err) => console.error("[sim] ws error", err.message));
