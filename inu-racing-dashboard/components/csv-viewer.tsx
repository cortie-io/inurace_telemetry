'use client'

import { useRef, useState } from 'react'
import { Upload } from 'lucide-react'
import type { BatteryThresholds } from '@/lib/types'
import type { HistoryPoint } from '@/lib/metrics'
import { TelemetryCharts } from '@/components/telemetry-charts'

type ParsedPoint = HistoryPoint & { time: string }

// Matches the header /api/telemetry/csv writes, but keyed by column NAME rather than position —
// robust to reordered columns, and to a "kw" column being absent (older export, or a hand-edited
// file), which just gets recomputed from voltage*current instead of failing the whole parse.
const REQUIRED_COLUMNS = [
  'time',
  'speed',
  'steeringAngle',
  'brakeFront',
  'brakeRear',
  'batteryTemp',
  'batteryVoltage',
  'batteryCurrent',
] as const

function parseCsv(text: string): { points: ParsedPoint[] } | { error: string } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (lines.length < 2) return { error: 'File has no data rows' }

  const header = lines[0].split(',').map((h) => h.trim())
  const index: Record<string, number> = {}
  header.forEach((name, i) => {
    index[name] = i
  })

  const missing = REQUIRED_COLUMNS.filter((c) => !(c in index))
  if (missing.length > 0) {
    return { error: `Missing required column(s): ${missing.join(', ')}` }
  }

  const points: ParsedPoint[] = []
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',')
    const rawTime = cols[index.time]
    const parsedTime = Date.parse(rawTime)
    const timestamp = Number.isFinite(parsedTime) ? parsedTime : Number(rawTime)
    const speed = Number(cols[index.speed])
    const steeringAngle = Number(cols[index.steeringAngle])
    const brakeFront = Number(cols[index.brakeFront])
    const brakeRear = Number(cols[index.brakeRear])
    const batteryTemp = Number(cols[index.batteryTemp])
    const batteryVoltage = Number(cols[index.batteryVoltage])
    const batteryCurrent = Number(cols[index.batteryCurrent])
    const kw = 'kw' in index ? Number(cols[index.kw]) : (batteryVoltage * batteryCurrent) / 1000

    // Skip rows that don't parse cleanly rather than aborting the whole file over one bad line.
    if (
      ![timestamp, speed, steeringAngle, brakeFront, brakeRear, batteryTemp, batteryVoltage, batteryCurrent, kw].every(
        Number.isFinite,
      )
    ) {
      continue
    }

    points.push({
      timestamp,
      speed,
      steeringAngle,
      brakeFront,
      brakeRear,
      batteryTemp,
      batteryVoltage,
      batteryCurrent,
      kw,
      time: new Date(timestamp).toLocaleTimeString('en-US', { hour12: false }),
    })
  }

  points.sort((a, b) => a.timestamp - b.timestamp)
  return { points }
}

// History/Lab View data is always server-bucketed to ~120 points before it ever reaches
// TelemetryCharts (see db/telemetry.ts's TARGET_BUCKETS) — a raw CSV upload has no such limit and
// can easily be several thousand rows, which made Recharts' hover/tooltip tracking (which scans
// point positions on every mousemove) noticeably laggy, independent of the earlier Tooltip
// animation fix. Simple stride decimation down to a comparable point count keeps hover snappy
// without needing a different rendering strategy for this one data source.
const MAX_CHART_POINTS = 600

function downsample<T>(points: T[], max: number): T[] {
  if (points.length <= max) return points
  const stride = points.length / max
  const result: T[] = []
  for (let i = 0; i < max; i++) {
    result.push(points[Math.floor(i * stride)])
  }
  return result
}

interface CsvViewerProps {
  thresholds: BatteryThresholds
}

// Standalone CSV telemetry viewer — decoupled from the DB entirely, so a file downloaded from Lab
// View (or shared by someone else) can be visualized without needing DB access. Reuses the exact
// same TelemetryCharts the DB-backed views use, so there's only one chart implementation either
// way — this component's whole job is turning a File into the array shape that expects.
export function CsvViewer({ thresholds }: CsvViewerProps) {
  const [fileName, setFileName] = useState<string | null>(null)
  const [data, setData] = useState<ParsedPoint[] | null>(null)
  const [totalRows, setTotalRows] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    setError(null)
    setFileName(file.name)
    const text = await file.text()
    const result = parseCsv(text)
    if ('error' in result) {
      setError(result.error)
      setData(null)
      return
    }
    if (result.points.length === 0) {
      setError('No valid rows found in this file')
      setData(null)
      return
    }
    setTotalRows(result.points.length)
    setData(downsample(result.points, MAX_CHART_POINTS))
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3 rounded border border-border bg-card px-4 py-3">
        <button
          onClick={() => inputRef.current?.click()}
          className="flex items-center gap-1.5 rounded bg-primary px-3 py-1.5 font-mono text-[0.7rem] font-bold uppercase tracking-wider text-primary-foreground transition-colors hover:bg-primary/85"
        >
          <Upload className="size-3.5" aria-hidden="true" />
          Upload CSV
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void handleFile(file)
            e.target.value = ''
          }}
        />
        {fileName && (
          <span className="font-mono text-[0.7rem] uppercase text-muted-foreground">
            {fileName}
            {data &&
              (totalRows > data.length
                ? ` — ${totalRows.toLocaleString()} rows, showing ${data.length.toLocaleString()} (downsampled for performance)`
                : ` — ${data.length.toLocaleString()} rows`)}
          </span>
        )}
        {error && <span className="font-mono text-[0.7rem] uppercase text-racing-red">{error}</span>}
      </div>

      {data ? (
        <div className="rounded border border-border bg-card p-3">
          <TelemetryCharts data={data} thresholds={thresholds} />
        </div>
      ) : (
        <div className="flex h-40 items-center justify-center rounded border border-border bg-card font-mono text-xs uppercase tracking-wider text-muted-foreground/50">
          Upload a telemetry CSV (from Lab View's "Download CSV") to view it as a graph
        </div>
      )}
    </div>
  )
}
