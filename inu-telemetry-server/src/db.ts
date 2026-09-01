import { compare } from "bcrypt-ts";
import pg from "pg";
import { env } from "./env.js";

export const pool = new pg.Pool({ connectionString: env.databaseUrl });

// telemetry_samples is range-partitioned by day (created by the dashboard app's migration —
// this only ensures the day partitions themselves exist, it never creates the parent table).
export async function ensurePartitionsAround(date: Date): Promise<void> {
  for (const offsetDays of [0, 1]) {
    const from = new Date(date);
    from.setUTCDate(from.getUTCDate() + offsetDays);
    from.setUTCHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setUTCDate(to.getUTCDate() + 1);

    const fromStr = from.toISOString().slice(0, 10);
    const toStr = to.toISOString().slice(0, 10);
    const table = `telemetry_samples_${fromStr.replace(/-/g, "_")}`;

    await pool.query(
      `CREATE TABLE IF NOT EXISTS ${table} PARTITION OF telemetry_samples FOR VALUES FROM ('${fromStr}') TO ('${toStr}')`,
    );
  }
}

const RETENTION_DAYS = 90; // ~3 months
const COMPACT_AFTER_DAYS = 1;

/**
 * Deletes telemetry_samples (and telemetry_samples_compact rows) older than the retention window
 * — except any row belonging to a session that has at least one bookmark, which is kept forever
 * regardless of age (explicit policy: bookmarked records are never auto-pruned). Unlinked rows
 * (session_id IS NULL) count as unprotected and age out normally. Compact rows never belong to a
 * bookmarked session in the first place (compactOldSamples skips those entirely), so their cutoff
 * doesn't need the same NOT EXISTS check.
 */
export async function deleteExpiredSamples(): Promise<number> {
  const raw = await pool.query(
    `DELETE FROM telemetry_samples t
     WHERE t.time < now() - interval '${RETENTION_DAYS} days'
       AND NOT EXISTS (SELECT 1 FROM bookmarks b WHERE b.session_id = t.session_id)`,
  );
  const compact = await pool.query(
    `DELETE FROM telemetry_samples_compact WHERE time < now() - interval '${RETENTION_DAYS} days'`,
  );
  return (raw.rowCount ?? 0) + (compact.rowCount ?? 0);
}

/**
 * Rolls up telemetry_samples rows older than COMPACT_AFTER_DAYS into 1-second-bucket aggregates
 * in telemetry_samples_compact, then deletes the raw rows that fed each bucket — this is what
 * keeps continuous high-frequency ingest from growing storage unbounded across the 90-day
 * retention window. Same bookmark exemption as deleteExpiredSamples: a session with at least one
 * Lab Time mark is skipped entirely, so only "background" driving data ever gets coarsened.
 *
 * INSERT and DELETE run in one transaction against the identical WHERE clause. That alone makes
 * this safe to call on a recurring schedule (currently every 3h, see server.ts) with no extra
 * bookkeeping: now() is stable for the whole transaction (it's transaction_timestamp() under the
 * hood), so both statements see the same cutoff, and once a row is compacted+deleted it can never
 * match that WHERE clause again on a later run.
 */
export async function compactOldSamples(): Promise<{ rowsCompacted: number; bucketsWritten: number }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const cutoffClause = `t.time < now() - interval '${COMPACT_AFTER_DAYS} days'
       AND NOT EXISTS (SELECT 1 FROM bookmarks b WHERE b.session_id = t.session_id)`;

    const inserted = await client.query(
      `INSERT INTO telemetry_samples_compact
         (time, device_id, session_id, sample_count, avg_speed, max_speed, avg_steering_angle,
          avg_brake_front, avg_brake_rear, avg_battery_temp, max_battery_temp, avg_battery_voltage,
          avg_battery_current, rtd_frac, precharge_frac)
       SELECT
         date_trunc('second', t.time), t.device_id, t.session_id, count(*),
         avg(t.speed), max(t.speed), avg(t.steering_angle), avg(t.brake_front), avg(t.brake_rear),
         avg(t.battery_temp), max(t.battery_temp), avg(t.battery_voltage), avg(t.battery_current),
         avg(t.rtd::int), avg(t.precharge::int)
       FROM telemetry_samples t
       WHERE ${cutoffClause}
       GROUP BY date_trunc('second', t.time), t.device_id, t.session_id`,
    );

    const deleted = await client.query(`DELETE FROM telemetry_samples t WHERE ${cutoffClause}`);

    await client.query("COMMIT");
    return { rowsCompacted: deleted.rowCount ?? 0, bucketsWritten: inserted.rowCount ?? 0 };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export interface DeviceRecord {
  id: string;
  deviceKey: string;
}

export async function authenticateDevice(
  deviceKey: string,
  token: string,
): Promise<DeviceRecord | null> {
  const { rows } = await pool.query<{ id: string; device_key: string; token_hash: string }>(
    "SELECT id, device_key, token_hash FROM devices WHERE device_key = $1",
    [deviceKey],
  );
  const row = rows[0];
  if (!row) return null;
  const ok = await compare(token, row.token_hash);
  if (!ok) return null;
  return { id: row.id, deviceKey: row.device_key };
}

export async function touchDeviceLastSeen(deviceId: string): Promise<void> {
  await pool.query("UPDATE devices SET last_seen_at = now() WHERE id = $1", [deviceId]);
}

export interface ActiveLab {
  sessionId: string;
  name: string;
  startedAt: number;
}

export interface LabBookmark {
  id: string;
  label: string;
  startTimestamp: number;
  endTimestamp: number;
  startElapsed: number;
  endElapsed: number;
}

/** The Lab (session) that's currently recording, if any — restored on boot so a restart
 *  mid-session doesn't lose the "who's watching this stays in sync" state. */
export async function loadOpenLab(): Promise<ActiveLab | null> {
  const { rows } = await pool.query<{ id: string; name: string; started_at: Date }>(
    "SELECT id, name, started_at FROM sessions WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1",
  );
  const row = rows[0];
  if (!row) return null;
  return { sessionId: row.id, name: row.name, startedAt: row.started_at.getTime() };
}

/** Lab Time marks recorded so far for a session — used to resync a freshly-connected /live
 *  viewer with whatever's already been marked in the currently-open Lab. */
export async function loadBookmarksForSession(sessionId: string): Promise<LabBookmark[]> {
  const { rows } = await pool.query<{
    id: string;
    label: string;
    start_ts: Date;
    end_ts: Date;
    start_elapsed_ms: number;
    end_elapsed_ms: number;
  }>(
    "SELECT id, label, start_ts, end_ts, start_elapsed_ms, end_elapsed_ms FROM bookmarks WHERE session_id = $1 ORDER BY start_ts ASC",
    [sessionId],
  );
  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    startTimestamp: r.start_ts.getTime(),
    endTimestamp: r.end_ts.getTime(),
    startElapsed: r.start_elapsed_ms,
    endElapsed: r.end_elapsed_ms,
  }));
}

/**
 * Every known device's last-seen time, restored on boot so a /live viewer connecting right
 * after a server restart still gets a meaningful "last seen Xs ago" instead of nothing.
 * Values here are then kept current in-memory (see server.ts's deviceLastSeen map) without
 * hitting the DB on every message — this is only the initial load.
 */
export async function loadDeviceLastSeen(): Promise<Map<string, number | null>> {
  const { rows } = await pool.query<{ device_key: string; last_seen_at: Date | null }>(
    "SELECT device_key, last_seen_at FROM devices",
  );
  const map = new Map<string, number | null>();
  for (const row of rows) {
    map.set(row.device_key, row.last_seen_at ? row.last_seen_at.getTime() : null);
  }
  return map;
}

export interface BufferedSample {
  time: Date;
  deviceId: string;
  sessionId: string | null;
  steeringAngle: number;
  brakeFront: number;
  brakeRear: number;
  speed: number;
  batteryTemp: number;
  batteryVoltage: number;
  batteryCurrent: number;
  rtd: boolean;
  precharge: boolean;
}

const SAMPLE_COLUMNS = [
  "time",
  "device_id",
  "session_id",
  "steering_angle",
  "brake_front",
  "brake_rear",
  "speed",
  "battery_temp",
  "battery_voltage",
  "battery_current",
  "rtd",
  "precharge",
];

export class BatchWriter {
  private buffer: BufferedSample[] = [];
  private flushing = false;
  private droppedSinceLog = 0;
  private timer: ReturnType<typeof setInterval>;

  constructor(
    private opts: { intervalMs: number; maxRows: number; hardCap: number },
  ) {
    this.timer = setInterval(() => void this.flush(), opts.intervalMs);
  }

  push(sample: BufferedSample): void {
    if (this.buffer.length >= this.opts.hardCap) {
      this.buffer.shift();
      this.droppedSinceLog++;
      if (this.droppedSinceLog % 1000 === 1) {
        console.warn(
          `[batch-writer] buffer at hard cap (${this.opts.hardCap}), dropping oldest samples ` +
            `(${this.droppedSinceLog} dropped since last log) — Postgres can't keep up with ingest rate`,
        );
      }
    }
    this.buffer.push(sample);
    if (this.buffer.length >= this.opts.maxRows) void this.flush();
  }

  get bufferedCount(): number {
    return this.buffer.length;
  }

  async flush(): Promise<void> {
    if (this.flushing || this.buffer.length === 0) return;
    this.flushing = true;
    const batch = this.buffer.splice(0, this.buffer.length);
    try {
      const cols = SAMPLE_COLUMNS.length;
      const placeholders: string[] = [];
      const values: unknown[] = [];
      batch.forEach((s, i) => {
        const base = i * cols;
        placeholders.push(
          `(${Array.from({ length: cols }, (_, j) => `$${base + j + 1}`).join(",")})`,
        );
        values.push(
          s.time,
          s.deviceId,
          s.sessionId,
          s.steeringAngle,
          s.brakeFront,
          s.brakeRear,
          s.speed,
          s.batteryTemp,
          s.batteryVoltage,
          s.batteryCurrent,
          s.rtd,
          s.precharge,
        );
      });
      const sql = `INSERT INTO telemetry_samples (${SAMPLE_COLUMNS.join(",")}) VALUES ${placeholders.join(",")}`;
      await pool.query(sql, values);
      console.log(`[batch-writer] flushed ${batch.length} rows in one INSERT`);
    } catch (err) {
      console.error(`[batch-writer] flush of ${batch.length} rows failed, batch dropped:`, err);
    } finally {
      this.flushing = false;
    }
  }

  async shutdown(): Promise<void> {
    clearInterval(this.timer);
    await this.flush();
  }
}
