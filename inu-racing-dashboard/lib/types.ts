export interface TelemetrySnapshot {
  timestamp: number
  steeringAngle: number // -180 to 180 degrees
  brakeFront: number // 0-100 %
  brakeRear: number // 0-100 %
  speed: number // 0-150 km/h
  batteryTemp: number // 0-80 C
  batteryVoltage: number // 0-100 V
  batteryCurrent: number // 0-400 A
  rtd: boolean // Ready To Drive
  preCharge: boolean
}

export interface TelemetryPoint {
  t: number // seconds since view start
  time: string
  steeringAngle: number
  brakeFront: number
  brakeRear: number
  speed: number
  batteryTemp: number
  batteryVoltage: number
  batteryCurrent: number
  kw: number // batteryVoltage * batteryCurrent / 1000, computed on arrival — not sent over the wire
}

/** A "Lab Time" mark — a start->end window of interest within a session, not a single instant. */
export interface Bookmark {
  id: string
  label: string
  startTimestamp: number
  endTimestamp: number
  startElapsed: number
  endElapsed: number
}

export interface Session {
  id: string
  name: string
  startedAt: number
  endedAt: number
  durationMs: number
  bookmarks: Bookmark[]
  maxSpeed: number
  maxBatteryTemp: number
}

export interface BatteryThresholds {
  batteryTempMax: number
  batteryVoltageMax: number
  batteryCurrentMax: number
}
