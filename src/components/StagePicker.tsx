import { useEffect, useRef } from 'react'
import { STAGE_ICON, STAGES } from '../lib/stages'
import type { Stage } from '../types'
import { Icon } from './Icon'
import { Tip } from './Tip'

type Props = {
  value: Stage
  onChange: (stage: Stage) => void
  open: boolean
  onOpenChange: (open: boolean) => void
}

// Which column the card sits in: a menu rather than a <select>, so each stage shows its column's icon.
// Opens downward, right-aligned under the panel header's buttons.
export const StagePicker = ({ value, onChange, open, onOpenChange }: Props) => {
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const outside = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) onOpenChange(false)
    }
    document.addEventListener('mousedown', outside)
    return () => document.removeEventListener('mousedown', outside)
  }, [open, onOpenChange])

  const pick = (stage: Stage) => {
    if (stage !== value) onChange(stage)
    onOpenChange(false)
  }

  return (
    <div ref={boxRef} className="relative flex">
      <Tip label="Move the card to another column">
        <button
          type="button"
          onClick={() => onOpenChange(!open)}
          aria-haspopup="menu"
          aria-expanded={open}
          className={`flex h-7 cursor-pointer items-center gap-1.5 rounded border border-deck-600 bg-deck-800 px-1.5 text-xs text-deck-200 hover:bg-deck-700 ${
            open ? 'ring-1 ring-deck-500' : ''
          }`}
        >
          <Icon name={STAGE_ICON[value]} size={12} />
          <span>{STAGES.find((s) => s.value === value)?.label}</span>
          <span className="text-deck-500">⌄</span>
        </button>
      </Tip>
      {open && (
        <div
          role="menu"
          className="absolute top-full right-0 z-40 mt-1 flex w-44 flex-col rounded-xl border border-deck-700 bg-deck-800 py-1 shadow-lg"
        >
          {STAGES.map((s) => (
            <button
              key={s.value}
              type="button"
              role="menuitem"
              onClick={() => pick(s.value)}
              className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-sm text-deck-200 hover:bg-deck-700"
            >
              <Icon name={STAGE_ICON[s.value]} />
              <span className="flex-1">{s.label}</span>
              <span className="w-3 shrink-0 text-grass-400">{s.value === value ? '✓' : ''}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
