import { useEffect, useRef, useState } from 'react'
import type { BoardFilter } from '../lib/filters'

const CI_OPTIONS = [
  { value: 'pass', label: '✓ pass' },
  { value: 'fail', label: '✗ fail' },
  { value: 'pending', label: '… pending' },
  { value: 'none', label: 'none' },
]

type MultiSelectProps = {
  label: string
  options: { value: string; label: string }[]
  selected: string[]
  onChange: (v: string[]) => void
}

const MultiSelect = ({ label, options, selected, onChange }: MultiSelectProps) => {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [])

  const toggle = (v: string) => onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v])
  const on = selected.length > 0

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs ${
          on ? 'border-grass-600 bg-grass-600/20 text-grass-300' : 'border-deck-600 text-deck-300 hover:bg-deck-700'
        }`}
      >
        {label}
        {on && <span className="rounded-full bg-grass-600 px-1.5 text-[10px] text-white">{selected.length}</span>}
        <span className="text-deck-500">▾</span>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 flex min-w-44 flex-col rounded-md border border-deck-700 bg-deck-800 py-1 shadow-xl">
          {options.length === 0 && <span className="px-3 py-2 text-xs text-deck-500">nothing to filter</span>}
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => toggle(o.value)}
              className="flex cursor-pointer items-center gap-2 whitespace-nowrap px-3 py-2 text-left text-xs text-deck-200 hover:bg-deck-700"
            >
              <span
                className={`flex h-3.5 w-3.5 items-center justify-center rounded border text-[9px] ${
                  selected.includes(o.value) ? 'border-grass-500 bg-grass-600 text-white' : 'border-deck-600'
                }`}
              >
                {selected.includes(o.value) && '✓'}
              </span>
              {o.label}
            </button>
          ))}
          {on && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="mt-1 cursor-pointer border-t border-deck-700 px-3 pt-1.5 pb-0.5 text-left text-xs text-deck-400 hover:text-deck-200"
            >
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// Project (repo) + CI-state filters, shared by the Reviews and Pull Requests boards.
export const BoardFilters = ({
  repos,
  filter,
  onChange,
}: {
  repos: string[]
  filter: BoardFilter
  onChange: (f: BoardFilter) => void
}) => (
  <div className="flex items-center gap-2">
    <MultiSelect
      label="Projects"
      options={repos.map((r) => ({ value: r, label: r }))}
      selected={filter.repos}
      onChange={(repos) => onChange({ ...filter, repos })}
    />
    <MultiSelect label="CI" options={CI_OPTIONS} selected={filter.ci} onChange={(ci) => onChange({ ...filter, ci })} />
  </div>
)
