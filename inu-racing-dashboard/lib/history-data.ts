export type RangeKey = '10s' | '30s' | '1m' | '5m' | '15m' | '30m' | '1h' | '6h' | '24h'

// Day-level presets (3d/7d) were dropped — for this dashboard, anything beyond a day is better
// served by the Custom date/time range picker than a fixed preset button.
export const RANGE_OPTIONS: { key: RangeKey; label: string; ms: number }[] = [
  { key: '10s', label: '10S', ms: 10 * 1000 },
  { key: '30s', label: '30S', ms: 30 * 1000 },
  { key: '1m', label: '1M', ms: 60 * 1000 },
  { key: '5m', label: '5M', ms: 5 * 60 * 1000 },
  { key: '15m', label: '15M', ms: 15 * 60 * 1000 },
  { key: '30m', label: '30M', ms: 30 * 60 * 1000 },
  { key: '1h', label: '1H', ms: 60 * 60 * 1000 },
  { key: '6h', label: '6H', ms: 6 * 60 * 60 * 1000 },
  { key: '24h', label: '24H', ms: 24 * 60 * 60 * 1000 },
]
