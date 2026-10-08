-- telemetry_samples: the high-frequency time-series table. Range-partitioned by day so old
-- data can be pruned later with DROP TABLE on a partition instead of a slow DELETE+VACUUM.
-- No TimescaleDB (not installed on this box, and plain declarative partitioning is enough at
-- this volume without touching shared_preload_libraries / restarting Postgres).
--
-- Applied by db/migrate.ts, after the drizzle-managed tables (devices/sessions) exist, since
-- this references both by foreign key. Written to be safely re-runnable.
CREATE TABLE IF NOT EXISTS telemetry_samples (
  time timestamptz NOT NULL,
  device_id uuid NOT NULL REFERENCES devices(id),
  session_id uuid REFERENCES sessions(id),
  steering_angle real NOT NULL,
  brake_front real NOT NULL,
  brake_rear real NOT NULL,
  speed real NOT NULL,
  battery_temp real NOT NULL,
  battery_voltage real NOT NULL,
  battery_current real NOT NULL,
  rtd boolean NOT NULL,
  precharge boolean NOT NULL
) PARTITION BY RANGE (time);

-- BRIN is the right index type here: cheap to maintain on an append-only, naturally
-- time-ordered table, and small even as row counts grow into the hundreds of millions.
CREATE INDEX IF NOT EXISTS telemetry_samples_time_brin_idx ON telemetry_samples USING BRIN (time);
CREATE INDEX IF NOT EXISTS telemetry_samples_device_time_idx ON telemetry_samples (device_id, time);
CREATE INDEX IF NOT EXISTS telemetry_samples_session_idx ON telemetry_samples (session_id) WHERE session_id IS NOT NULL;

-- Day partitions themselves are created lazily by inu-telemetry-server on boot/daily
-- (ensurePartitionsAround in db.ts) — none are created here so this file stays a one-time
-- schema bootstrap rather than something that goes stale.

-- telemetry_samples_compact: coarse 1-second-bucket rollup of samples once they age past
-- COMPACT_AFTER_DAYS (1 day — see inu-telemetry-server/src/db.ts's compactOldSamples). This is
-- what keeps 3-month retention from growing storage unbounded under continuous high-frequency
-- ingest: raw rows older than a day get rolled up into one row per second per
-- device/session and the raw rows are deleted. Not partitioned — after rollup the row count is
-- orders of magnitude smaller than telemetry_samples, a single BRIN-indexed table is enough.
-- Sessions with a Lab Time (bookmark) are exempt from compaction, same rule as the retention job —
-- those stay full-resolution in telemetry_samples indefinitely, only "background" driving data
-- gets coarsened.
CREATE TABLE IF NOT EXISTS telemetry_samples_compact (
  time timestamptz NOT NULL,
  device_id uuid NOT NULL REFERENCES devices(id),
  session_id uuid REFERENCES sessions(id),
  sample_count integer NOT NULL,
  avg_speed real NOT NULL,
  max_speed real NOT NULL,
  avg_steering_angle real NOT NULL,
  avg_brake_front real NOT NULL,
  avg_brake_rear real NOT NULL,
  avg_battery_temp real NOT NULL,
  max_battery_temp real NOT NULL,
  avg_battery_voltage real NOT NULL,
  avg_battery_current real NOT NULL,
  rtd_frac real NOT NULL,
  precharge_frac real NOT NULL
);

CREATE INDEX IF NOT EXISTS telemetry_samples_compact_time_brin_idx ON telemetry_samples_compact USING BRIN (time);
CREATE INDEX IF NOT EXISTS telemetry_samples_compact_device_time_idx ON telemetry_samples_compact (device_id, time);
CREATE INDEX IF NOT EXISTS telemetry_samples_compact_session_idx ON telemetry_samples_compact (session_id) WHERE session_id IS NOT NULL;

-- 2026-09-30: BMS SOC + VESC CAN status channels. Added as nullable columns (no default) so the
-- ALTER is metadata-only on the already-populated partitions — rows written before this stay
-- NULL, which readers treat as "not recorded" rather than a real 0. ALTER on the partitioned
-- parent propagates to every existing day partition.
ALTER TABLE telemetry_samples
  ADD COLUMN IF NOT EXISTS battery_soc real,
  ADD COLUMN IF NOT EXISTS battery_ah_used real,
  ADD COLUMN IF NOT EXISTS vesc_temp real,
  ADD COLUMN IF NOT EXISTS erpm real,
  ADD COLUMN IF NOT EXISTS motor_current real,
  ADD COLUMN IF NOT EXISTS motor_temp real,
  ADD COLUMN IF NOT EXISTS regen_wh real,
  ADD COLUMN IF NOT EXISTS regen_ah real,
  ADD COLUMN IF NOT EXISTS regen_current real;

ALTER TABLE telemetry_samples_compact
  ADD COLUMN IF NOT EXISTS avg_battery_soc real,
  ADD COLUMN IF NOT EXISTS avg_battery_ah_used real,
  ADD COLUMN IF NOT EXISTS avg_vesc_temp real,
  ADD COLUMN IF NOT EXISTS avg_erpm real,
  ADD COLUMN IF NOT EXISTS avg_motor_current real,
  ADD COLUMN IF NOT EXISTS avg_motor_temp real,
  ADD COLUMN IF NOT EXISTS avg_regen_wh real,
  ADD COLUMN IF NOT EXISTS avg_regen_ah real,
  ADD COLUMN IF NOT EXISTS avg_regen_current real;
