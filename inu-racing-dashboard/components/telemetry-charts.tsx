'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { BatteryThresholds } from '@/lib/types'
import { METRICS, type HistoryPoint, type MetricConfig, type MetricKey } from '@/lib/metrics'

const PX_PER_POINT = 6 // horizontal density per data point once zoomed in past 1x
const MIN_ZOOM = 0.5
const MAX_ZOOM = 6

// History/Lab View data arrives pre-rounded from the server, but a CSV upload in the Viewer tab
// is parsed straight from raw file values with no rounding at all — rounding for display here,
// once, covers every caller instead of relying on each one to have already done it upstream.
function formatValue(v: number): string {
  const rounded = Math.round(v * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

interface TelemetryChartsProps {
  data: Array<HistoryPoint & { time: string }> | null
  thresholds: BatteryThresholds
}

// Shared chart-rendering used by both the History Archive section and the Lab View tab — takes
// already-fetched data (the caller owns the /api/history fetch, since it also needs `stats` for
// its own stats bar) and handles zoom/scroll + the all-6-at-once vs one-big-channel toggle.
//
// type="monotone" here (not "linear" like the live Graphs tab uses) is deliberate and safe: this
// is static, already-fully-fetched data that never grows after the initial load, so monotone's
// "reshapes the tail as new points arrive" behavior — the reason graph-view.tsx avoids it for
// live streaming data — never triggers here. Smooth curves are fine (nicer, even) for anything
// that isn't currently being appended to in real time.
export function TelemetryCharts({ data, thresholds }: TelemetryChartsProps) {
  const [zoom, setZoom] = useState(1)
  const [metric, setMetric] = useState<MetricKey | 'all'>('all')

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-card px-4 py-3">
        {/* min-w-0 lets this section shrink/wrap normally inside the justify-between row instead
            of the channel-button-group's overflow-x-auto content forcing its min-width to its
            full unclipped content size (flexbox's default min-width:auto uses an item's
            min-content size unless something overrides it) — without this, a wide channel list
            could push the Zoom controls out of the row entirely on some viewport widths. */}
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <span className="font-mono text-[0.7rem] uppercase tracking-widest text-muted-foreground">
            Channel
          </span>
          {/* "All N" is a different kind of choice than the channels next to it — it's a view
              mode, not one more channel among equals — so it's kept visually separate from the
              connected channel button-group instead of living inside it. Label reads off
              METRICS.length rather than a hardcoded number so it can't go stale again the next
              time a channel is added (it already had, silently, once — "All 6" after Power made
              it 7). */}
          <button
            onClick={() => setMetric('all')}
            className={`rounded border px-3 py-1.5 font-mono text-xs font-semibold uppercase tracking-wider transition-colors ${
              metric === 'all'
                ? 'border-racing-gold bg-racing-gold/10 text-foreground'
                : 'border-border bg-card text-muted-foreground hover:text-foreground'
            }`}
            aria-pressed={metric === 'all'}
          >
            All {METRICS.length}
          </button>
          {/* overflow-x-auto (not overflow-hidden) — labels like "Battery Temperature" across 6
              buttons don't fit a mobile-width row, and overflow-hidden would silently clip the
              rest off-screen instead of just letting them scroll into view. */}
          <div className="tc-scroll flex overflow-x-auto rounded border border-border">
            {METRICS.map((m) => (
              <button
                key={m.key}
                onClick={() => setMetric(m.key)}
                className={`shrink-0 border-r border-border px-3 py-1.5 font-mono text-xs font-semibold uppercase tracking-wider transition-colors last:border-r-0 ${
                  metric === m.key
                    ? 'bg-foreground text-background'
                    : 'bg-card text-muted-foreground hover:text-foreground'
                }`}
                aria-pressed={metric === m.key}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <span className="font-mono text-[0.7rem] uppercase tracking-widest text-muted-foreground">
            Zoom {zoom.toFixed(1)}x
          </span>
          <button
            onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z / 1.5))}
            disabled={zoom <= MIN_ZOOM}
            className="rounded border border-border px-2 py-1 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
            aria-label="Zoom out"
          >
            −
          </button>
          <button
            onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z * 1.5))}
            disabled={zoom >= MAX_ZOOM}
            className="rounded border border-border px-2 py-1 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
            aria-label="Zoom in"
          >
            +
          </button>
        </div>
      </div>

      {data === null ? (
        <div className="flex h-40 items-center justify-center bg-card font-mono text-xs text-muted-foreground/50">
          Loading…
        </div>
      ) : data.length === 0 ? (
        <div className="flex h-40 items-center justify-center bg-card font-mono text-xs text-muted-foreground/50">
          No data recorded in this window
        </div>
      ) : metric === 'all' ? (
        <div className="grid grid-cols-1 gap-px overflow-hidden rounded border border-border bg-border lg:grid-cols-2">
          {METRICS.map((m) => (
            <TelemetryChartCard
              key={m.key}
              metric={m}
              data={data}
              zoom={zoom}
              danger={m.dangerKey ? thresholds[m.dangerKey] : undefined}
            />
          ))}
        </div>
      ) : (
        <div className="overflow-hidden rounded border border-border">
          <TelemetryChartCard
            metric={METRICS.find((m) => m.key === metric)!}
            data={data}
            zoom={zoom}
            danger={
              METRICS.find((m) => m.key === metric)!.dangerKey
                ? thresholds[METRICS.find((m) => m.key === metric)!.dangerKey!]
                : undefined
            }
            tall
          />
        </div>
      )}
    </div>
  )
}

function TelemetryChartCard({
  metric,
  data,
  zoom,
  danger,
  tall,
}: {
  metric: MetricConfig
  data: Array<HistoryPoint & { time: string }>
  zoom: number
  danger?: number
  tall?: boolean
}) {
  const Chart = metric.area ? AreaChart : LineChart
  const last = data[data.length - 1]
  const current = metric.series.map((s) => formatValue(Number(last[s.dataKey]))).join(' / ')

  // Measures this card's own scroll wrapper rather than a value computed once in the parent —
  // each card can sit in a different layout (full-width "tall" single-channel view vs. a
  // half-width cell in the 2-column "All 6" grid), so there's no single width that's correct for
  // both. Without this, a low zoom level could leave the chart narrower than its wrapper (blank
  // space on the right instead of a full-width chart) because the old fixed floor (600px) had no
  // idea how wide the actual card was.
  const scrollRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    setContainerWidth(el.clientWidth)
    const observer = new ResizeObserver((entries) => {
      setContainerWidth(entries[0].contentRect.width)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // A thin scrollbar (or the zoom +/- buttons) turned out to be too easy to miss entirely — a
  // plain vertical mouse-wheel scroll over the chart now pans it horizontally instead, the same
  // convention wide-table/timeline UIs commonly use. Only takes over when there's genuinely
  // something to scroll (scrollWidth > clientWidth); otherwise the wheel event is left alone so
  // the page still scrolls normally over a card that already shows all its data.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    function onWheel(e: WheelEvent) {
      if (!el || el.scrollWidth <= el.clientWidth) return
      e.preventDefault()
      el.scrollLeft += Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const dataWidth = data.length * PX_PER_POINT * zoom
  const chartWidth = Math.max(containerWidth, dataWidth)
  // Only true once we've actually measured the wrapper (containerWidth > 0) and the data is
  // genuinely wider than it — this is what drives the explicit "scroll for more" hint below, so
  // the horizontal-scroll affordance doesn't depend on a reader noticing a thin scrollbar.
  const scrollable = containerWidth > 0 && dataWidth > containerWidth

  return (
    <div className="bg-card p-4">
      <div className="mb-3 flex items-baseline justify-between border-b border-border pb-2">
        <h3 className="flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          {metric.label}
          {scrollable && (
            <span className="flex items-center gap-0.5 rounded border border-border px-1.5 py-0.5 text-[0.6rem] normal-case tracking-normal text-muted-foreground/70">
              <ChevronLeft className="size-2.5" aria-hidden="true" />
              scroll
              <ChevronRight className="size-2.5" aria-hidden="true" />
            </span>
          )}
        </h3>
        <span className="font-mono text-lg font-semibold text-foreground tabular-nums">
          {current}
          <span className="ml-1 text-xs font-normal text-muted-foreground">{metric.unit}</span>
        </span>
      </div>
      {/* Fixed pixel width inside a scrollable wrapper, controlled by the shared zoom level —
          instead of squashing the whole time range to fit the card. Never narrower than the
          wrapper itself, so zooming out always fills the card instead of leaving blank space. */}
      <div ref={scrollRef} className={`${tall ? 'h-72' : 'h-40'} tc-scroll overflow-x-auto`}>
        <div style={{ width: chartWidth || '100%', height: '100%' }}>
          <ResponsiveContainer width="100%" height="100%">
            <Chart data={data} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
              <defs>
                {metric.series.map((s) => (
                  <linearGradient key={s.dataKey} id={`tcgrad-${metric.key}-${s.dataKey}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={s.color} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={s.color} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="time"
                tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }}
                stroke="var(--border)"
                minTickGap={30}
              />
              <YAxis
                domain={metric.domain}
                tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }}
                stroke="var(--border)"
                width={40}
              />
              <Tooltip
                isAnimationActive={false}
                formatter={(value) => (typeof value === 'number' ? formatValue(value) : value)}
                contentStyle={{
                  background: 'var(--popover)',
                  border: '1px solid var(--border)',
                  borderRadius: 2,
                  fontSize: 12,
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--popover-foreground)',
                }}
              />
              {danger !== undefined && (
                <ReferenceLine y={danger} stroke="var(--racing-red)" strokeDasharray="4 4" strokeWidth={1.5} />
              )}
              {metric.series.map((s) =>
                metric.area ? (
                  <Area
                    key={s.dataKey}
                    type="monotone"
                    dataKey={s.dataKey}
                    name={s.name}
                    stroke={s.color}
                    strokeWidth={2}
                    fill={`url(#tcgrad-${metric.key}-${s.dataKey})`}
                    isAnimationActive={false}
                    dot={false}
                  />
                ) : (
                  <Line
                    key={s.dataKey}
                    type="monotone"
                    dataKey={s.dataKey}
                    name={s.name}
                    stroke={s.color}
                    strokeWidth={2}
                    isAnimationActive={false}
                    dot={false}
                  />
                ),
              )}
            </Chart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
