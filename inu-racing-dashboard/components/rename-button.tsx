'use client'

import { useState } from 'react'
import { Check, Pencil, X } from 'lucide-react'

interface RenameButtonProps {
  currentName: string
  onRename: (name: string) => void
}

// Shared inline-rename control — an edit icon that swaps itself for a small input + confirm/
// cancel while active. Used by both the sidebar Lab Log (control-panel.tsx) and the Lab View
// tab's Lab Log list, which is why it's its own component rather than living in either one.
// Every handler stops propagation since this always sits inside a row that's itself clickable
// (opens that Lab in Lab View) — without it, starting a rename would also navigate away.
export function RenameButton({ currentName, onRename }: RenameButtonProps) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(currentName)

  function startEdit(e: React.MouseEvent) {
    e.stopPropagation()
    setValue(currentName)
    setEditing(true)
  }

  function commit() {
    const trimmed = value.trim()
    if (trimmed && trimmed !== currentName) onRename(trimmed)
    setEditing(false)
  }

  function cancel() {
    setEditing(false)
  }

  if (editing) {
    return (
      <span onClick={(e) => e.stopPropagation()} className="flex shrink-0 items-center gap-1">
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) commit()
            if (e.key === 'Escape') cancel()
          }}
          className="h-6 w-28 rounded border border-input bg-background px-1.5 font-mono text-[0.7rem] text-foreground outline-none focus:border-racing-gold"
        />
        <button
          onClick={commit}
          className="text-racing-green transition-colors hover:opacity-80"
          aria-label="Save name"
        >
          <Check className="size-3.5" aria-hidden="true" />
        </button>
        <button
          onClick={cancel}
          className="text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Cancel rename"
        >
          <X className="size-3.5" aria-hidden="true" />
        </button>
      </span>
    )
  }

  return (
    <button
      onClick={startEdit}
      className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
      aria-label="Rename"
    >
      <Pencil className="size-3" aria-hidden="true" />
    </button>
  )
}
