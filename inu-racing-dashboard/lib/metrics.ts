// Shared channel definitions for anything that plots telemetry_samples over a time range: the
// History Archive chart and the Lab View playback tab both use this so they always offer the
// same 6 channels, with the same domains/danger lines, as the live Graphs tab (Brake Front+Rear
// count as one channel there too — see components/graph-view.tsx, which is hand-written
// separately since it consumes live TelemetryPoint[] rather than fetched HistoryPoint[], but
// should stay configured identically to this).

// Mirrors db/telemetry.ts's HistoryPoint — kept as a local type (not imported from db/*) since
// this is used from client components and that module pulls in server-only DB client code.
// `kw` isn't a real column — nothing stores or queries it. It's computed client-side as
// batteryVoltage * batteryCurrent / 1000 at the same two call sites that map the /api/history
// response into this shape (history-view.tsx, lab-playback-view.tsx), so it can live here and be
// treated by TelemetryCharts exactly like every other channel, no special-casing needed.
export interface HistoryPoint {
  timestamp: number
  speed: number
  steeringAngle: number
  brakeFront: number
  brakeRear: number
  batteryTemp: number
  batteryVoltage: number
  batteryCurrent: number
  kw: number
}

export type MetricKey =
  | 'speed'
  | 'steering'
  | 'brake'
  | 'batteryTemp'
  | 'batteryVoltage'
  | 'batteryCurrent'
  | 'kw'

export interface MetricSeries {
  dataKey: keyof HistoryPoint
  name: string
  color: string
}

export interface MetricConfig {
  key: MetricKey
  label: string
  unit: string
  domain: [number, number]
  area: boolean
  /** Which BatteryThresholds field (if any) draws this channel's danger reference line. */
  dangerKey?: 'batteryTempMax' | 'batteryVoltageMax' | 'batteryCurrentMax'
  series: MetricSeries[]
}

export const METRICS: MetricConfig[] = [
  {
    key: 'speed',
    label: 'Speed',
    unit: 'km/h',
    domain: [0, 150],
    area: true,
    series: [{ dataKey: 'speed', name: 'Speed', color: 'var(--primary)' }],
  },
  {
    key: 'steering',
    label: 'Steering Angle',
    unit: '°',
    domain: [-180, 180],
    area: false,
    series: [{ dataKey: 'steeringAngle', name: 'Angle', color: 'var(--racing-gold)' }],
  },
  {
    key: 'brake',
    label: 'Brake Signal',
    unit: '%',
    domain: [0, 100],
    area: false,
    series: [
      { dataKey: 'brakeFront', name: 'Front', color: 'var(--racing-gold)' },
      { dataKey: 'brakeRear', name: 'Rear', color: 'var(--racing-red)' },
    ],
  },
  {
    key: 'batteryTemp',
    label: 'Battery Temperature',
    unit: '°C',
    domain: [0, 80],
    area: true,
    dangerKey: 'batteryTempMax',
    series: [{ dataKey: 'batteryTemp', name: 'Temp', color: 'var(--racing-green)' }],
  },
  {
    key: 'batteryVoltage',
    label: 'Battery Voltage',
    unit: 'V',
    domain: [0, 100],
    area: true,
    dangerKey: 'batteryVoltageMax',
    series: [{ dataKey: 'batteryVoltage', name: 'Voltage', color: 'var(--racing-gold)' }],
  },
  {
    key: 'batteryCurrent',
    label: 'Battery Current',
    unit: 'A',
    domain: [0, 400],
    area: true,
    dangerKey: 'batteryCurrentMax',
    series: [{ dataKey: 'batteryCurrent', name: 'Current', color: 'var(--racing-gold)' }],
  },
  {
    key: 'kw',
    label: 'Power',
    unit: 'kW',
    // Theoretical ceiling from the existing voltage/current gauge scales (100V * 400A / 1000),
    // not a separately-configured setting.
    domain: [0, 40],
    area: true,
    series: [{ dataKey: 'kw', name: 'Power', color: 'var(--racing-blue)' }],
  },
]
