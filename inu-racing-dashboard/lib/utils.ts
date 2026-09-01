import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** "3s ago" / "2m ago" — for showing how stale the last received telemetry is while offline. */
export function formatAgo(sinceMs: number, nowMs: number): string {
  const elapsed = Math.max(0, Math.floor((nowMs - sinceMs) / 1000))
  if (elapsed < 60) return `${elapsed}s ago`
  const minutes = Math.floor(elapsed / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ago`
}

/** "12s" / "3m 24s" / "1h 05m" — elapsed duration since a start instant (not "ago", a countdown-up),
 *  for showing how long the car's current connection has been open. */
export function formatDuration(sinceMs: number, nowMs: number): string {
  const elapsed = Math.max(0, Math.floor((nowMs - sinceMs) / 1000))
  if (elapsed < 60) return `${elapsed}s`
  const minutes = Math.floor(elapsed / 60)
  const seconds = elapsed % 60
  if (minutes < 60) return `${minutes}m ${String(seconds).padStart(2, '0')}s`
  const hours = Math.floor(minutes / 60)
  const remMinutes = minutes % 60
  return `${hours}h ${String(remMinutes).padStart(2, '0')}m`
}
