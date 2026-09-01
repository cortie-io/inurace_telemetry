'use client'

import type { BatteryThresholds, TelemetrySnapshot } from '@/lib/types'

interface Channel {
  id: string
  label: string
  value: string
  unit: string
  danger?: boolean
}

export function LiveTicker({
  data,
  thresholds,
}: {
  data: TelemetrySnapshot
  thresholds: BatteryThresholds
}) {
  const channels: Channel[] = [
    { id: 'CH01', label: 'Speed', value: data.speed.toFixed(0), unit: 'km/h' },
    {
      id: 'CH02',
      label: 'Steer',
      value: `${data.steeringAngle > 0 ? '+' : ''}${Math.round(data.steeringAngle)}`,
      unit: 'deg',
    },
    {
      id: 'CH03',
      label: 'Brake F',
      value: data.brakeFront.toFixed(0),
      unit: '%',
    },
    {
      id: 'CH04',
      label: 'Brake R',
      value: data.brakeRear.toFixed(0),
      unit: '%',
    },
    {
      id: 'CH05',
      label: 'Batt Temp',
      value: data.batteryTemp.toFixed(1),
      unit: '°C',
      danger: data.batteryTemp >= thresholds.batteryTempMax,
    },
    {
      id: 'CH06',
      label: 'Voltage',
      value: data.batteryVoltage.toFixed(1),
      unit: 'V',
      danger: data.batteryVoltage >= thresholds.batteryVoltageMax,
    },
    {
      id: 'CH07',
      label: 'Current',
      value: data.batteryCurrent.toFixed(0),
      unit: 'A',
      danger: data.batteryCurrent >= thresholds.batteryCurrentMax,
    },
  ]

  return (
    <div className="border-b border-border bg-secondary">
      <div className="mx-auto grid max-w-[1600px] grid-cols-2 sm:grid-cols-4 lg:grid-cols-7">
        {channels.map((ch) => (
          <div
            key={ch.id}
            className="flex flex-col gap-1 border-r border-border px-4 py-3 last:border-r-0"
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-[0.6rem] uppercase tracking-widest text-muted-foreground">
                {ch.label}
              </span>
              <span className="font-mono text-[0.55rem] tracking-wider text-muted-foreground/50">
                {ch.id}
              </span>
            </div>
            <div className="flex items-baseline gap-1">
              <span
                className="font-mono text-xl font-semibold tabular-nums"
                style={{
                  color: ch.danger ? 'var(--racing-red)' : 'var(--foreground)',
                }}
              >
                {ch.value}
              </span>
              <span className="font-mono text-[0.65rem] text-muted-foreground">
                {ch.unit}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
