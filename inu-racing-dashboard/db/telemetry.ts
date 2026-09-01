import postgres from "postgres";

// telemetry_samples is queried with raw SQL (not the drizzle ORM table object) — see the note
// in schema.ts on why the partitioned table isn't modeled there.
//
// This uses its OWN postgres.js connection rather than db/index.ts's `client` — drizzle()
// mutates whatever client instance it wraps in a way that breaks that same instance's raw
// tagged-template Date-parameter serialization for queries issued outside the ORM (confirmed by
// reproducing: an unwrapped client encodes `Date` params fine, the same client after being
// passed through `drizzle(client, ...)` throws ERR_INVALID_ARG_TYPE encoding a Date). Keeping
// this pool separate sidesteps that entirely, and as a bonus keeps the hot read path for
// history queries off the ORM's connection pool.
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set (check .env.local)");
}
const client = postgres(process.env.DATABASE_URL, { max: 5 });

export interface HistoryPoint {
  timestamp: number;
  speed: number;
  steeringAngle: number;
  brakeFront: number;
  brakeRear: number;
  batteryTemp: number;
  batteryVoltage: number;
  batteryCurrent: number;
}

export interface HistoryStats {
  avgSpeed: number;
  maxSpeed: number;
  peakTemp: number;
  samples: number;
  /** % of samples in range where rtd/precharge was true — these are booleans, not curves,
   *  so they're summarized as "how much of this window" rather than plotted as a channel. */
  rtdActivePct: number;
  prechargeActivePct: number;
}

const TARGET_BUCKETS = 120;

export async function queryHistory(
  from: Date,
  to: Date,
): Promise<{ points: HistoryPoint[]; stats: HistoryStats }> {
  const rangeMs = Math.max(1000, to.getTime() - from.getTime());
  const bucketSeconds = Math.max(1, Math.round(rangeMs / TARGET_BUCKETS / 1000));
  const bucketInterval = `${bucketSeconds} seconds`;

  // Combines full-resolution telemetry_samples with the coarser 1-second-bucket rollups in
  // telemetry_samples_compact (written by inu-telemetry-server's compactOldSamples once data
  // passes ~1 day old) via a sample-count-weighted average — so a History range that spans the
  // compaction boundary reads as one continuous series instead of losing its older half. Raw rows
  // count as weight 1 each; compact rows already represent `sample_count` raw rows, so weighting
  // by that reconstructs the same average as if compaction had never happened.
  const rows = await client<
    {
      bucket: Date;
      speed: number | null;
      steering_angle: number | null;
      brake_front: number | null;
      brake_rear: number | null;
      battery_temp: number | null;
      battery_voltage: number | null;
      battery_current: number | null;
    }[]
  >`
    WITH combined AS (
      SELECT time, speed, steering_angle, brake_front, brake_rear, battery_temp, battery_voltage,
             battery_current, 1 AS n
      FROM telemetry_samples
      WHERE time >= ${from} AND time <= ${to}
      UNION ALL
      SELECT time, avg_speed, avg_steering_angle, avg_brake_front, avg_brake_rear, avg_battery_temp,
             avg_battery_voltage, avg_battery_current, sample_count AS n
      FROM telemetry_samples_compact
      WHERE time >= ${from} AND time <= ${to}
    )
    SELECT
      date_bin(${bucketInterval}::interval, time, to_timestamp(0)) AS bucket,
      (sum(speed * n) / sum(n))::real AS speed,
      (sum(steering_angle * n) / sum(n))::real AS steering_angle,
      (sum(brake_front * n) / sum(n))::real AS brake_front,
      (sum(brake_rear * n) / sum(n))::real AS brake_rear,
      (sum(battery_temp * n) / sum(n))::real AS battery_temp,
      (sum(battery_voltage * n) / sum(n))::real AS battery_voltage,
      (sum(battery_current * n) / sum(n))::real AS battery_current
    FROM combined
    GROUP BY bucket
    ORDER BY bucket
  `;

  const points: HistoryPoint[] = rows.map((r) => ({
    timestamp: r.bucket.getTime(),
    speed: Math.round(r.speed ?? 0),
    steeringAngle: Math.round(r.steering_angle ?? 0),
    brakeFront: Math.round(r.brake_front ?? 0),
    brakeRear: Math.round(r.brake_rear ?? 0),
    batteryTemp: Math.round((r.battery_temp ?? 0) * 10) / 10,
    batteryVoltage: Math.round((r.battery_voltage ?? 0) * 10) / 10,
    batteryCurrent: Math.round(r.battery_current ?? 0),
  }));

  const [statsRow] = await client<
    {
      avg_speed: number | null;
      max_speed: number | null;
      peak_temp: number | null;
      samples: string;
      rtd_active_pct: number | null;
      precharge_active_pct: number | null;
    }[]
  >`
    WITH combined AS (
      SELECT speed AS avg_speed_val, speed AS max_speed_val, battery_temp AS avg_temp_val,
             battery_temp AS max_temp_val, (rtd::int)::real AS rtd_frac,
             (precharge::int)::real AS prechg_frac, 1 AS n
      FROM telemetry_samples
      WHERE time >= ${from} AND time <= ${to}
      UNION ALL
      SELECT avg_speed, max_speed, avg_battery_temp, max_battery_temp, rtd_frac, precharge_frac,
             sample_count AS n
      FROM telemetry_samples_compact
      WHERE time >= ${from} AND time <= ${to}
    )
    SELECT
      (sum(avg_speed_val * n) FILTER (WHERE avg_speed_val > 0)
        / NULLIF(sum(n) FILTER (WHERE avg_speed_val > 0), 0))::real AS avg_speed,
      max(max_speed_val)::real AS max_speed,
      max(max_temp_val)::real AS peak_temp,
      sum(n) AS samples,
      (sum(rtd_frac * n) / NULLIF(sum(n), 0) * 100)::real AS rtd_active_pct,
      (sum(prechg_frac * n) / NULLIF(sum(n), 0) * 100)::real AS precharge_active_pct
    FROM combined
  `;

  return {
    points,
    stats: {
      avgSpeed: Math.round(statsRow?.avg_speed ?? 0),
      maxSpeed: Math.round(statsRow?.max_speed ?? 0),
      peakTemp: Math.round((statsRow?.peak_temp ?? 0) * 10) / 10,
      samples: Number(statsRow?.samples ?? 0),
      rtdActivePct: Math.round(statsRow?.rtd_active_pct ?? 0),
      prechargeActivePct: Math.round(statsRow?.precharge_active_pct ?? 0),
    },
  };
}

export interface RawSample {
  time: number;
  deviceKey: string;
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

/** Raw, unaggregated rows exactly as stored — for the "Raw Data" tab. Newest first. */
export async function queryRawSamples(
  page: number,
  pageSize: number,
): Promise<{ rows: RawSample[]; total: number }> {
  const offset = page * pageSize;

  const rows = await client<RawSampleRow[]>`
    SELECT
      t.time, d.device_key, t.session_id, t.steering_angle, t.brake_front, t.brake_rear,
      t.speed, t.battery_temp, t.battery_voltage, t.battery_current, t.rtd, t.precharge
    FROM telemetry_samples t
    JOIN devices d ON d.id = t.device_id
    ORDER BY t.time DESC
    LIMIT ${pageSize} OFFSET ${offset}
  `;

  const [{ count }] = await client<{ count: string }[]>`SELECT count(*) FROM telemetry_samples`;

  return {
    rows: rows.map(mapRawSample),
    total: Number(count),
  };
}

const CSV_EXPORT_ROW_CAP = 200_000; // ~a few hours of continuous high-frequency streaming

/** Raw, unaggregated rows exactly as stored for a time range — oldest first — for the CSV export
 *  on a Lab View recording. Raw-only, same as queryRawSamples: a range old enough to have been
 *  compacted just exports thinner, consistent with how the Raw Data tab already behaves there. */
export async function queryRawSamplesInRange(from: Date, to: Date): Promise<RawSample[]> {
  const rows = await client<RawSampleRow[]>`
    SELECT
      t.time, d.device_key, t.session_id, t.steering_angle, t.brake_front, t.brake_rear,
      t.speed, t.battery_temp, t.battery_voltage, t.battery_current, t.rtd, t.precharge
    FROM telemetry_samples t
    JOIN devices d ON d.id = t.device_id
    WHERE t.time >= ${from} AND t.time <= ${to}
    ORDER BY t.time ASC
    LIMIT ${CSV_EXPORT_ROW_CAP}
  `;
  return rows.map(mapRawSample);
}

/** Detach raw samples from a session before it's deleted — the FK would otherwise block it.
 *  Keeps the sensor readings themselves; only the session_id link is cleared. */
export async function unlinkSessionFromTelemetry(sessionId: string): Promise<void> {
  await client`UPDATE telemetry_samples SET session_id = NULL WHERE session_id = ${sessionId}`;
}

/**
 * Computed from telemetry_samples at stop time rather than tracked client-side — with multiple
 * viewers able to watch (and now stop) the same Lab, whichever browser happens to click Stop
 * only knows what it personally observed, which is wrong the moment more than one screen is
 * open. The DB has the real answer for the whole session regardless of who was watching when.
 */
export async function querySessionPeaks(
  sessionId: string,
): Promise<{ maxSpeed: number; maxBatteryTemp: number }> {
  const [row] = await client<{ max_speed: number | null; max_battery_temp: number | null }[]>`
    SELECT max(speed) AS max_speed, max(battery_temp) AS max_battery_temp
    FROM telemetry_samples WHERE session_id = ${sessionId}
  `;
  return {
    maxSpeed: row?.max_speed ?? 0,
    maxBatteryTemp: row?.max_battery_temp ?? 0,
  };
}

type RawSampleRow = {
  time: Date;
  device_key: string;
  session_id: string | null;
  steering_angle: number;
  brake_front: number;
  brake_rear: number;
  speed: number;
  battery_temp: number;
  battery_voltage: number;
  battery_current: number;
  rtd: boolean;
  precharge: boolean;
};

function mapRawSample(r: RawSampleRow): RawSample {
  return {
    time: r.time.getTime(),
    deviceKey: r.device_key,
    sessionId: r.session_id,
    steeringAngle: r.steering_angle,
    brakeFront: r.brake_front,
    brakeRear: r.brake_rear,
    speed: r.speed,
    batteryTemp: r.battery_temp,
    batteryVoltage: r.battery_voltage,
    batteryCurrent: r.battery_current,
    rtd: r.rtd,
    precharge: r.precharge,
  };
}
