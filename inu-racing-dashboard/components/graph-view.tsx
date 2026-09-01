'use client'

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
import type { BatteryThresholds, TelemetryPoint } from '@/lib/types'

interface SeriesConfig {
  key: keyof TelemetryPoint
  name: string
  color: string
}

interface GraphCardProps {
  title: string
  unit: string
  data: TelemetryPoint[]
  series: SeriesConfig[]
  domain: [number, number]
  current: string
  danger?: number
  area?: boolean
}

// type="linear" (not "monotone") deliberately: monotone recalculates curve tangents from
// neighboring points, so every new point at the tail slightly reshapes the segment behind it —
// at real update rates that reads as constant jitter. Straight segments never change once drawn.
function GraphCard({
  title,
  unit,
  data,
  series,
  domain,
  current,
  danger,
  area,
}: GraphCardProps) {
  const Chart = area ? AreaChart : LineChart
  return (
    <div className="bg-card p-4">
      <div className="mb-3 flex items-baseline justify-between border-b border-border pb-2">
        <h3 className="font-mono text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          {title}
        </h3>
        <span className="font-mono text-lg font-semibold text-foreground tabular-nums">
          {current}
          <span className="ml-1 text-xs font-normal text-muted-foreground">
            {unit}
          </span>
        </span>
      </div>
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <Chart data={data} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
            <defs>
              {series.map((s) => (
                <linearGradient
                  key={s.key as string}
                  id={`grad-${s.key as string}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="0%" stopColor={s.color} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={s.color} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--border)"
              vertical={false}
            />
            <XAxis
              dataKey="time"
              tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }}
              tickFormatter={(v: string) => v.split('.')[0]}
              stroke="var(--border)"
              minTickGap={30}
            />
            <YAxis
              domain={domain}
              tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }}
              stroke="var(--border)"
              width={40}
            />
            <Tooltip
              isAnimationActive={false}
              contentStyle={{
                background: 'var(--popover)',
                border: '1px solid var(--border)',
                borderRadius: 2,
                fontSize: 12,
                fontFamily: 'var(--font-mono)',
                color: 'var(--popover-foreground)',
              }}
              labelFormatter={(v) => String(v)}
            />
            {danger !== undefined && (
              <ReferenceLine
                y={danger}
                stroke="var(--racing-red)"
                strokeDasharray="4 4"
                strokeWidth={1.5}
              />
            )}
            {series.map((s) =>
              area ? (
                <Area
                  key={s.key as string}
                  type="linear"
                  dataKey={s.key as string}
                  name={s.name}
                  stroke={s.color}
                  strokeWidth={2}
                  fill={`url(#grad-${s.key as string})`}
                  isAnimationActive={false}
                  dot={false}
                />
              ) : (
                <Line
                  key={s.key as string}
                  type="linear"
                  dataKey={s.key as string}
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
  )
}

export function GraphView({
  data,
  thresholds,
}: {
  data: TelemetryPoint[]
  thresholds: BatteryThresholds
}) {
  const last = data[data.length - 1]
  return (
    <div className="grid grid-cols-1 gap-px overflow-hidden rounded border border-border bg-border lg:grid-cols-2">
      <GraphCard
        title="Speed"
        unit="km/h"
        data={data}
        domain={[0, 150]}
        current={last ? String(last.speed) : '—'}
        series={[{ key: 'speed', name: 'Speed', color: 'var(--primary)' }]}
        area
      />
      <GraphCard
        title="Steering Angle"
        unit="°"
        data={data}
        domain={[-180, 180]}
        current={last ? String(last.steeringAngle) : '—'}
        series={[
          { key: 'steeringAngle', name: 'Angle', color: 'var(--racing-gold)' },
        ]}
      />
      <GraphCard
        title="Brake Signal"
        unit="%"
        data={data}
        domain={[0, 100]}
        current={
          last ? `${last.brakeFront} / ${last.brakeRear}` : '—'
        }
        series={[
          { key: 'brakeFront', name: 'Front', color: 'var(--racing-gold)' },
          { key: 'brakeRear', name: 'Rear', color: 'var(--racing-red)' },
        ]}
      />
      <GraphCard
        title="Battery Temperature"
        unit="°C"
        data={data}
        domain={[0, 80]}
        current={last ? String(last.batteryTemp) : '—'}
        danger={thresholds.batteryTempMax}
        series={[
          { key: 'batteryTemp', name: 'Temp', color: 'var(--racing-green)' },
        ]}
        area
      />
      <GraphCard
        title="Battery Voltage"
        unit="V"
        data={data}
        domain={[0, 100]}
        current={last ? String(last.batteryVoltage) : '—'}
        danger={thresholds.batteryVoltageMax}
        series={[
          { key: 'batteryVoltage', name: 'Voltage', color: 'var(--racing-gold)' },
        ]}
        area
      />
      <GraphCard
        title="Battery Current"
        unit="A"
        data={data}
        domain={[0, 400]}
        current={last ? String(last.batteryCurrent) : '—'}
        danger={thresholds.batteryCurrentMax}
        series={[
          { key: 'batteryCurrent', name: 'Current', color: 'var(--racing-gold)' },
        ]}
        area
      />
      <GraphCard
        title="Power"
        unit="kW"
        data={data}
        domain={[0, 40]}
        current={last ? last.kw.toFixed(1) : '—'}
        series={[{ key: 'kw', name: 'Power', color: 'var(--racing-blue)' }]}
        area
      />
    </div>
  )
}
