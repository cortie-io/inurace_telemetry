import { z } from "zod";

export const deviceAuthMessage = z.object({
  type: z.literal("auth"),
  deviceKey: z.string().min(1).max(64),
  token: z.string().min(1).max(256),
});

// Firmware has been observed sending rtd/preCharge as a plain 0/1 number rather than a JSON
// boolean (e.g. `doc["rtd"] = digitalRead(pin)` in ArduinoJson serializes as a number, not
// `true`/`false`) — every telemetry frame from a device doing that was silently rejected by a
// strict z.boolean(), which looked like "the car stopped sending data" from the dashboard side
// even though it was streaming the whole time. Accepting either shape and coercing keeps the
// pipeline working regardless of which the firmware sends, rather than requiring an exact match.
const boolish = z
  .union([z.boolean(), z.number()])
  .transform((v) => (typeof v === "number" ? v !== 0 : v));

export const telemetryMessage = z.object({
  type: z.literal("telemetry"),
  steeringAngle: z.number().min(-180).max(180),
  brakeFront: z.number().min(0).max(100),
  brakeRear: z.number().min(0).max(100),
  speed: z.number().min(0).max(400),
  batteryTemp: z.number().min(-40).max(200),
  batteryVoltage: z.number().min(0).max(1000),
  batteryCurrent: z.number().min(-1000).max(1000),
  rtd: boolish,
  preCharge: boolish,
});

export const deviceInboundMessage = z.discriminatedUnion("type", [
  deviceAuthMessage,
  telemetryMessage,
]);

export const liveAuthMessage = z.object({
  type: z.literal("auth"),
  ticket: z.string().min(1).max(512),
});

export const liveInboundMessage = z.discriminatedUnion("type", [liveAuthMessage]);

export type TelemetryMessage = z.infer<typeof telemetryMessage>;
