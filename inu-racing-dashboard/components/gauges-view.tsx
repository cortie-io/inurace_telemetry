'use client'

import type { TelemetrySnapshot } from '@/lib/types'
import { CircularGauge } from '@/components/gauges/circular-gauge'
import { SteeringGauge } from '@/components/gauges/steering-gauge'
import { BrakeBars } from '@/components/gauges/brake-bars'

function Cell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-center bg-card p-6">
      {children}
    </div>
  )
}

export function GaugesView({ data }: { data: TelemetrySnapshot }) {
  return (
    <div className="grid grid-cols-1 gap-px overflow-hidden rounded border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
      <Cell>
        <CircularGauge
          label="Speed"
          value={data.speed}
          min={0}
          max={150}
          unit="km/h"
          color="var(--primary)"
        />
      </Cell>
      <Cell>
        <SteeringGauge angle={data.steeringAngle} />
      </Cell>
      <Cell>
        <BrakeBars front={data.brakeFront} rear={data.brakeRear} />
      </Cell>
      <Cell>
        <CircularGauge
          label="Battery Temp"
          value={data.batteryTemp}
          min={0}
          max={80}
          unit="°C"
          color="var(--racing-green)"
          danger={65}
          decimals={1}
        />
      </Cell>
      <Cell>
        <CircularGauge
          label="Battery Voltage"
          value={data.batteryVoltage}
          min={0}
          max={100}
          unit="V"
          color="var(--racing-gold)"
          decimals={1}
        />
      </Cell>
      <Cell>
        <CircularGauge
          label="Battery Current"
          value={data.batteryCurrent}
          min={0}
          max={400}
          unit="A"
          color="var(--racing-gold)"
          danger={340}
        />
      </Cell>
      <Cell>
        <CircularGauge
          label="Battery SOC"
          value={data.batterySoc}
          min={0}
          max={100}
          unit="%"
          color="var(--racing-green)"
        />
      </Cell>
      <Cell>
        <CircularGauge
          label="VESC Temp"
          value={data.vescTemp}
          min={0}
          max={120}
          unit="°C"
          color="var(--racing-gold)"
          danger={85}
          decimals={1}
        />
      </Cell>
      <Cell>
        <CircularGauge
          label="Motor Temp"
          value={data.motorTemp}
          min={0}
          max={150}
          unit="°C"
          color="var(--racing-gold)"
          danger={85}
          decimals={1}
        />
      </Cell>
      <Cell>
        <CircularGauge
          label="ERPM"
          value={data.erpm}
          min={0}
          max={25000}
          unit="erpm"
          color="var(--primary)"
        />
      </Cell>
      <Cell>
        <CircularGauge
          label="Motor Current"
          value={data.motorCurrent}
          min={-400}
          max={400}
          unit="A"
          color="var(--racing-gold)"
          decimals={1}
        />
      </Cell>
      <Cell>
        <CircularGauge
          label="Regen Current"
          value={data.regenCurrent}
          min={0}
          max={100}
          unit="A"
          color="var(--racing-green)"
          decimals={1}
        />
      </Cell>
    </div>
  )
}
