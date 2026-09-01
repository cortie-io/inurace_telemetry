import { boolean, integer, pgTable, real, text, timestamp, uuid } from "drizzle-orm/pg-core";

// No public signup — admin seeds accounts (same policy as classnet.chat). `role` has one value
// today ("crew") but stays a column for headroom rather than being hardcoded everywhere.
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name").notNull(),
  role: text("role").notNull().default("crew"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// One row per physical telemetry source (car/rig). tokenHash is bcrypt — the plaintext token is
// only ever shown once, at seed/creation time, same handling as a password.
export const devices = pgTable("devices", {
  id: uuid("id").primaryKey().defaultRandom(),
  deviceKey: text("device_key").notNull().unique(),
  tokenHash: text("token_hash").notNull(),
  label: text("label").notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  deviceId: uuid("device_id")
    .notNull()
    .references(() => devices.id),
  name: text("name").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  maxSpeed: real("max_speed").notNull().default(0),
  maxBatteryTemp: real("max_battery_temp").notNull().default(0),
  createdBy: uuid("created_by").references(() => users.id),
});

// A "Lab Time" mark: not a single instant but a start->end window of interest within a session
// (e.g. one corner, one braking test) — clicking it later re-plots exactly that window from
// telemetry_samples, which is why both ends are stored as real timestamps, not just a label.
export const bookmarks = pgTable("bookmarks", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => sessions.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  startTs: timestamp("start_ts", { withTimezone: true }).notNull(),
  endTs: timestamp("end_ts", { withTimezone: true }).notNull(),
  startElapsedMs: integer("start_elapsed_ms").notNull(),
  endElapsedMs: integer("end_elapsed_ms").notNull(),
});

// Singleton row (id always 1) — shared team-wide danger thresholds for the battery gauges/graphs,
// user-editable from the dashboard instead of hardcoded. One row is enough: this is a shared
// setting for the whole crew watching the same car, not a per-user preference.
export const settings = pgTable("settings", {
  id: integer("id").primaryKey().default(1),
  batteryTempMax: real("battery_temp_max").notNull().default(65),
  batteryVoltageMax: real("battery_voltage_max").notNull().default(100),
  batteryCurrentMax: real("battery_current_max").notNull().default(340),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid("updated_by").references(() => users.id),
});

// telemetry_samples is intentionally NOT modeled here — it's range-partitioned by day
// (see db/telemetry-schema.sql), which drizzle-kit's push/generate doesn't represent well.
// It's created by db/migrate.ts after the tables above, and queried with raw SQL
// (db/telemetry.ts) rather than through the ORM.
