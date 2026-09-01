'use client'

import { useEffect, useState } from 'react'
import { Download } from 'lucide-react'
import type { BatteryThresholds } from '@/lib/types'
import type { HistoryPoint } from '@/lib/metrics'
import { TelemetryCharts } from '@/components/telemetry-charts'
import { StatTile } from '@/components/stat-tile'

interface LabPlaybackViewProps {
  from: number
  to: number
  title: string
  thresholds: BatteryThresholds
}

interface HistoryStats {
  avgSpeed: number
  maxSpeed: number
  peakTemp: number
  samples: number
  rtdActivePct: number
  prechargeActivePct: number
}

function formatElapsed(ms: number) {
  const total = Math.floor(ms / 1000)
  const h = String(Math.floor(total / 3600)).padStart(2, '0')
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0')
  const s = String(total % 60).padStart(2, '0')
  return `${h}:${m}:${s}`
}

// Full-size recorded-Lab viewer — deliberately the same card layout/sizing (and now the same
// stats bar) as the live Graphs/History tabs rather than a compressed inline preview, so
// reviewing a recorded run looks and feels consistent everywhere in the app.
export function LabPlaybackView({ from, to, title, thresholds }: LabPlaybackViewProps) {
  const [data, setData] = useState<Array<HistoryPoint & { time: string }> | null>(null)
  const [stats, setStats] = useState<HistoryStats | null>(null)

  useEffect(() => {
    let cancelled = false
    setData(null)
    setStats(null)
    fetch(`/api/history?from=${from}&to=${to}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((res: { points: HistoryPoint[]; stats: HistoryStats } | null) => {
        if (cancelled || !res) return
        setData(
          res.points.map((p) => ({
            ...p,
            kw: (p.batteryVoltage * p.batteryCurrent) / 1000,
            time: new Date(p.timestamp).toLocaleTimeString('en-US', { hour12: false }),
          })),
        )
        setStats(res.stats)
      })
    return () => {
      cancelled = true
    }
  }, [from, to])

  return (
    <div className="flex flex-col gap-px overflow-hidden rounded border border-border bg-border">
      <div className="flex items-center justify-between gap-3 bg-card px-4 py-3">
        <div>
          <h3 className="font-mono text-xs font-semibold uppercase tracking-widest text-foreground">
            {title}
          </h3>
          <p className="font-mono text-[0.7rem] uppercase text-muted-foreground">
            {new Date(from).toLocaleString('en-US', { hour12: false })} →{' '}
            {new Date(to).toLocaleString('en-US', { hour12: false })}
          </p>
        </div>
        <a
          href={`/api/telemetry/csv?from=${from}&to=${to}`}
          download
          className="flex shrink-0 items-center gap-1.5 rounded border border-border px-3 py-1.5 font-mono text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
        >
          <Download className="size-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">Download</span> CSV
        </a>
      </div>

      <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4 lg:grid-cols-7">
        <StatTile label="Avg Speed" value={`${stats?.avgSpeed ?? 0}`} unit="km/h" />
        <StatTile label="Max Speed" value={`${Math.round(stats?.maxSpeed ?? 0)}`} unit="km/h" accent="var(--racing-blue)" />
        <StatTile label="Peak Temp" value={`${(stats?.peakTemp ?? 0).toFixed(0)}`} unit="°C" accent="var(--racing-red)" />
        <StatTile label="Active Time" value={formatElapsed(Math.max(0, to - from))} />
        <StatTile label="Labs" value="1" unit="run" />
        <StatTile label="RTD Active" value={`${stats?.rtdActivePct ?? 0}`} unit="%" accent="var(--racing-green)" />
        <StatTile label="PreChg Active" value={`${stats?.prechargeActivePct ?? 0}`} unit="%" accent="var(--primary)" />
      </div>

      <div className="bg-card p-3">
        <TelemetryCharts data={data} thresholds={thresholds} />
      </div>
    </div>
  )
}
