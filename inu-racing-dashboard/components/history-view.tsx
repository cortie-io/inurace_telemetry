'use client'

import { useEffect, useMemo, useState } from 'react'
import type { BatteryThresholds, Session } from '@/lib/types'
import { RANGE_OPTIONS, type RangeKey } from '@/lib/history-data'
import type { HistoryPoint } from '@/lib/metrics'
import { TelemetryCharts } from '@/components/telemetry-charts'
import { StatTile } from '@/components/stat-tile'

type RangeUnit = 'seconds' | 'minutes' | 'hours'
type RangeSelection =
  | { mode: 'preset'; key: RangeKey }
  | { mode: 'relative'; amount: number; unit: RangeUnit }
  | { mode: 'absolute'; from: number; to: number }

const UNIT_MS: Record<RangeUnit, number> = {
  seconds: 1_000,
  minutes: 60_000,
  hours: 3_600_000,
}

function resolveRange(sel: RangeSelection): { from: number; to: number } {
  if (sel.mode === 'absolute') return { from: sel.from, to: sel.to }
  const to = Date.now()
  const ms =
    sel.mode === 'preset'
      ? RANGE_OPTIONS.find((r) => r.key === sel.key)!.ms
      : Math.max(1, sel.amount) * UNIT_MS[sel.unit]
  return { from: to - ms, to }
}

function formatElapsed(ms: number) {
  const total = Math.floor(ms / 1000)
  const h = String(Math.floor(total / 3600)).padStart(2, '0')
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0')
  const s = String(total % 60).padStart(2, '0')
  return `${h}:${m}:${s}`
}

function toDatetimeLocal(ms: number) {
  const d = new Date(ms - new Date().getTimezoneOffset() * 60_000)
  return d.toISOString().slice(0, 16)
}

interface HistoryViewProps {
  // Only used to compute the "Labs"/"Active Time" summary stats for the selected range — the
  // browsable/interactive Lab Log list itself lives in the Lab View tab now (lab-log-list.tsx),
  // so History stays a pure Archive: range picker + stats + chart.
  liveSessions: Session[]
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

export function HistoryView({ liveSessions, thresholds }: HistoryViewProps) {
  const [rangeSel, setRangeSel] = useState<RangeSelection>({ mode: 'preset', key: '24h' })
  const [customOpen, setCustomOpen] = useState(false)
  const [customTab, setCustomTab] = useState<'relative' | 'absolute'>('absolute')
  const [relAmount, setRelAmount] = useState(45)
  const [relUnit, setRelUnit] = useState<RangeUnit>('minutes')
  const [absFrom, setAbsFrom] = useState(() => toDatetimeLocal(Date.now() - 3600_000))
  const [absTo, setAbsTo] = useState(() => toDatetimeLocal(Date.now()))

  const { from, to } = useMemo(() => resolveRange(rangeSel), [rangeSel])

  const [chartData, setChartData] = useState<Array<HistoryPoint & { time: string }> | null>(null)
  const [stats, setStats] = useState<HistoryStats>({
    avgSpeed: 0,
    maxSpeed: 0,
    peakTemp: 0,
    samples: 0,
    rtdActivePct: 0,
    prechargeActivePct: 0,
  })

  useEffect(() => {
    let cancelled = false
    setChartData(null)
    fetch(`/api/history?from=${from}&to=${to}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { points: HistoryPoint[]; stats: HistoryStats } | null) => {
        if (cancelled || !data) return
        const short = to - from <= 24 * 60 * 60 * 1000
        setChartData(
          data.points.map((p) => ({
            ...p,
            kw: (p.batteryVoltage * p.batteryCurrent) / 1000,
            time: new Date(p.timestamp).toLocaleString('en-US', short
              ? { hour: '2-digit', minute: '2-digit', hour12: false }
              : { month: 'numeric', day: 'numeric', hour: '2-digit', hour12: false }),
          })),
        )
        setStats(data.stats)
      })
    return () => {
      cancelled = true
    }
  }, [from, to])

  const sessions = useMemo(() => {
    return liveSessions.filter((s) => s.startedAt >= from && s.startedAt <= to)
  }, [from, to, liveSessions])

  // "Active Time" comes from real session start/stop boundaries rather than inferring it from
  // sample density (which doesn't hold now that samples arrive at millisecond resolution).
  const activeMs = useMemo(() => sessions.reduce((sum, s) => sum + s.durationMs, 0), [sessions])

  function applyCustom() {
    if (customTab === 'relative') {
      setRangeSel({ mode: 'relative', amount: relAmount, unit: relUnit })
    } else {
      const fromMs = new Date(absFrom).getTime()
      const toMs = new Date(absTo).getTime()
      if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || fromMs >= toMs) return
      setRangeSel({ mode: 'absolute', from: fromMs, to: toMs })
    }
    setCustomOpen(false)
  }

  const isCustomActive = rangeSel.mode !== 'preset'

  return (
    <div className="flex flex-col gap-px overflow-hidden rounded border border-border bg-border">
      {/* Toolbar: range */}
      <div className="flex flex-wrap items-center gap-3 bg-card px-4 py-3">
        <span className="font-mono text-[0.7rem] uppercase tracking-widest text-muted-foreground">
          Range
        </span>
        {/* overflow-x-auto (not overflow-hidden) — 9 preset buttons don't fit a mobile-width
            row, and overflow-hidden would silently clip the rest off-screen instead of just
            letting them scroll into view. */}
        <div className="tc-scroll flex overflow-x-auto rounded border border-border">
          {RANGE_OPTIONS.map((r) => (
            <button
              key={r.key}
              onClick={() => setRangeSel({ mode: 'preset', key: r.key })}
              className={`shrink-0 border-r border-border px-3 py-1.5 font-mono text-xs font-semibold uppercase tracking-wider transition-colors last:border-r-0 ${
                rangeSel.mode === 'preset' && rangeSel.key === r.key
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-card text-muted-foreground hover:text-foreground'
              }`}
              aria-pressed={rangeSel.mode === 'preset' && rangeSel.key === r.key}
            >
              {r.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setCustomOpen((v) => !v)}
          className={`rounded border px-3 py-1.5 font-mono text-xs font-semibold uppercase tracking-wider transition-colors ${
            isCustomActive
              ? 'border-racing-gold bg-racing-gold/10 text-foreground'
              : 'border-border bg-card text-muted-foreground hover:text-foreground'
          }`}
          aria-expanded={customOpen}
        >
          Custom Range
        </button>
      </div>

      {customOpen && (
        <div className="bg-card px-4 py-3">
          <div className="mb-3 flex overflow-hidden rounded border border-border" style={{ width: 'fit-content' }}>
            <button
              onClick={() => setCustomTab('relative')}
              className={`border-r border-border px-3 py-1.5 font-mono text-xs font-semibold uppercase tracking-wider transition-colors ${
                customTab === 'relative'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-card text-muted-foreground hover:text-foreground'
              }`}
              aria-pressed={customTab === 'relative'}
            >
              Relative
            </button>
            <button
              onClick={() => setCustomTab('absolute')}
              className={`px-3 py-1.5 font-mono text-xs font-semibold uppercase tracking-wider transition-colors ${
                customTab === 'absolute'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-card text-muted-foreground hover:text-foreground'
              }`}
              aria-pressed={customTab === 'absolute'}
            >
              Specific Date &amp; Time
            </button>
          </div>

          {customTab === 'relative' ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[0.7rem] uppercase text-muted-foreground">Last</span>
              <input
                type="number"
                min={1}
                value={relAmount}
                onChange={(e) => setRelAmount(Number(e.target.value))}
                className="h-8 w-20 rounded border border-input bg-background px-2 font-mono text-xs text-foreground outline-none focus:border-racing-gold"
              />
              <select
                value={relUnit}
                onChange={(e) => setRelUnit(e.target.value as RangeUnit)}
                className="h-8 rounded border border-input bg-background px-2 font-mono text-xs text-foreground outline-none focus:border-racing-gold"
              >
                <option value="seconds">Seconds</option>
                <option value="minutes">Minutes</option>
                <option value="hours">Hours</option>
              </select>
              <button
                onClick={applyCustom}
                className="h-8 rounded bg-primary px-3 font-mono text-[0.7rem] font-bold uppercase tracking-wider text-primary-foreground"
              >
                Apply
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[0.7rem] uppercase text-muted-foreground">From</span>
              <input
                type="datetime-local"
                value={absFrom}
                onChange={(e) => setAbsFrom(e.target.value)}
                className="h-8 rounded border border-input bg-background px-2 font-mono text-xs text-foreground outline-none focus:border-racing-gold"
              />
              <span className="font-mono text-[0.7rem] uppercase text-muted-foreground">To</span>
              <input
                type="datetime-local"
                value={absTo}
                onChange={(e) => setAbsTo(e.target.value)}
                className="h-8 rounded border border-input bg-background px-2 font-mono text-xs text-foreground outline-none focus:border-racing-gold"
              />
              <button
                onClick={applyCustom}
                className="h-8 rounded bg-primary px-3 font-mono text-[0.7rem] font-bold uppercase tracking-wider text-primary-foreground"
              >
                Apply
              </button>
            </div>
          )}
        </div>
      )}

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4 lg:grid-cols-7">
        <StatTile label="Avg Speed" value={`${stats.avgSpeed}`} unit="km/h" />
        <StatTile label="Max Speed" value={`${Math.round(stats.maxSpeed)}`} unit="km/h" accent="var(--racing-blue)" />
        <StatTile label="Peak Temp" value={`${stats.peakTemp.toFixed(0)}`} unit="°C" accent="var(--racing-red)" />
        <StatTile label="Active Time" value={formatElapsed(activeMs)} />
        <StatTile label="Labs" value={`${sessions.length}`} unit="runs" />
        {/* RTD/PreCharge are booleans, not curves — summarized as "% of range" rather than a channel */}
        <StatTile label="RTD Active" value={`${stats.rtdActivePct}`} unit="%" accent="var(--racing-green)" />
        <StatTile label="PreChg Active" value={`${stats.prechargeActivePct}`} unit="%" accent="var(--primary)" />
      </div>

      {/* Chart — shared with the Lab View tab: all channels or one at a time, zoom + scroll */}
      <div className="bg-card p-3">
        <TelemetryCharts data={chartData} thresholds={thresholds} />
      </div>
    </div>
  )
}
