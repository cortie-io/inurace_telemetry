'use client'

import { useState } from 'react'
import { Settings2 } from 'lucide-react'
import type { BatteryThresholds } from '@/lib/types'

interface ThresholdSettingsProps {
  thresholds: BatteryThresholds
  onSave: (next: BatteryThresholds) => Promise<void>
}

const FIELDS: { key: keyof BatteryThresholds; label: string; unit: string }[] = [
  { key: 'batteryTempMax', label: 'Batt Temp', unit: '°C' },
  { key: 'batteryVoltageMax', label: 'Voltage', unit: 'V' },
  { key: 'batteryCurrentMax', label: 'Current', unit: 'A' },
]

export function ThresholdSettings({ thresholds, onSave }: ThresholdSettingsProps) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(thresholds)
  const [saving, setSaving] = useState(false)

  function openPanel() {
    setDraft(thresholds) // discard any unsaved edits from a previous open
    setOpen(true)
  }

  async function save() {
    setSaving(true)
    try {
      await onSave(draft)
      setOpen(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="rounded border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <h2 className="flex items-center gap-1.5 font-mono text-xs font-semibold uppercase tracking-widest text-foreground">
          <Settings2 className="size-3.5" aria-hidden="true" />
          Danger Thresholds
        </h2>
        {!open && (
          <button
            onClick={openPanel}
            className="font-mono text-[0.7rem] uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
          >
            Edit
          </button>
        )}
      </div>

      {open ? (
        <div className="space-y-2.5 p-3">
          {FIELDS.map((f) => (
            <div key={f.key} className="flex items-center gap-2">
              <label className="w-20 shrink-0 font-mono text-[0.7rem] uppercase text-muted-foreground">
                {f.label}
              </label>
              <input
                type="number"
                value={draft[f.key]}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, [f.key]: Number(e.target.value) }))
                }
                className="h-8 w-full rounded border border-input bg-background px-2 font-mono text-xs text-foreground outline-none focus:border-racing-gold"
              />
              <span className="w-6 shrink-0 font-mono text-[0.65rem] text-muted-foreground">
                {f.unit}
              </span>
            </div>
          ))}
          <div className="flex gap-2 pt-1">
            <button
              onClick={save}
              disabled={saving}
              className="h-8 flex-1 rounded bg-primary font-mono text-[0.7rem] font-bold uppercase tracking-wider text-primary-foreground disabled:opacity-40"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={() => setOpen(false)}
              className="h-8 flex-1 rounded border border-border font-mono text-[0.7rem] uppercase tracking-wider text-muted-foreground hover:bg-secondary/50"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-px bg-border">
          {FIELDS.map((f) => (
            <div key={f.key} className="bg-card px-2 py-2 text-center">
              <p className="font-mono text-[0.6rem] uppercase text-muted-foreground">{f.label}</p>
              <p className="font-mono text-sm font-semibold text-foreground">
                {thresholds[f.key]}
                <span className="ml-0.5 text-[0.65rem] font-normal text-muted-foreground">{f.unit}</span>
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
