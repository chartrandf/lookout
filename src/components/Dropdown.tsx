import { type KeyboardEvent, useEffect, useRef, useState } from 'react'
import type { IconName } from '../lib/icons'
import { menuNav, typeAhead } from '../lib/menunav'
import { Icon } from './Icon'
import { Tip } from './Tip'

const TYPE_AHEAD_MS = 500 // a pause this long starts a new search, as in a native <select>

export type DropdownOption<T extends string> = { value: T; label: string; icon?: IconName }

type Props<T extends string> = {
  value: T
  options: DropdownOption<T>[]
  onChange: (value: T) => void
  label: string // the button's tooltip and accessible name: what picking does
  disabled?: boolean
}

// A <select> that can show icons: the button carries the selected option, the menu opens below it,
// right-aligned. Arrows/Home/End move through the options, typing jumps to the first label starting
// with it ("do" → Done), Enter picks, Esc/Tab or a click outside
// closes. Esc stops here, so the panel around it stays open.
export const Dropdown = <T extends string>({ value, options, onChange, label, disabled }: Props<T>) => {
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const itemsRef = useRef<(HTMLButtonElement | null)[]>([])
  const typedRef = useRef('') // what's been typed since the last pause
  const typedTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const current = options.find((o) => o.value === value)

  useEffect(() => {
    if (!open) return
    // WebKit doesn't focus a clicked button, so focus lands on the selected option for the keys
    itemsRef.current[
      Math.max(
        0,
        options.findIndex((o) => o.value === value),
      )
    ]?.focus()
    const outside = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', outside)
    return () => document.removeEventListener('mousedown', outside)
  }, [open, options, value])

  const close = () => {
    setOpen(false)
    buttonRef.current?.focus()
  }

  const pick = (v: T) => {
    if (v !== value) onChange(v)
    close()
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (!open) return
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      close()
      return
    }
    if (e.key === 'Tab') {
      setOpen(false)
      return
    }
    const focused = itemsRef.current.indexOf(document.activeElement as HTMLButtonElement)
    const next = menuNav(focused, e.key, options.length)
    if (next !== null) {
      e.preventDefault()
      itemsRef.current[next]?.focus()
      return
    }
    // a printable key types ahead; a space only once something's typed, else it picks
    const printable = e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey
    if (!printable || (e.key === ' ' && !typedRef.current)) return
    e.preventDefault()
    typedRef.current += e.key
    clearTimeout(typedTimer.current)
    typedTimer.current = setTimeout(() => {
      typedRef.current = ''
    }, TYPE_AHEAD_MS)
    const match = typeAhead(
      options.map((o) => o.label),
      typedRef.current,
      focused,
    )
    if (match >= 0) itemsRef.current[match]?.focus()
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: keys bubble up from the button and options
    <div ref={boxRef} onKeyDown={onKeyDown} className="relative flex">
      <Tip label={label}>
        <button
          ref={buttonRef}
          type="button"
          onClick={() => setOpen((o) => !o)}
          disabled={disabled}
          aria-label={label}
          aria-haspopup="menu"
          aria-expanded={open}
          className={`flex h-7 cursor-pointer items-center gap-1.5 rounded border border-deck-600 bg-deck-800 px-1.5 text-xs text-deck-200 hover:bg-deck-700 disabled:cursor-default disabled:opacity-50 ${
            open ? 'ring-1 ring-deck-500' : ''
          }`}
        >
          {current?.icon && <Icon name={current.icon} size={12} />}
          <span>{current?.label}</span>
          <Icon name="chevron-down" size={12} className="text-deck-500" />
        </button>
      </Tip>
      {open && (
        <div
          role="menu"
          className="absolute top-full right-0 z-40 mt-1 flex w-44 flex-col rounded-xl border border-deck-700 bg-deck-800 py-1 shadow-lg"
        >
          {options.map((o, i) => (
            <button
              key={o.value}
              ref={(el) => {
                itemsRef.current[i] = el
              }}
              type="button"
              role="menuitem"
              onClick={() => pick(o.value)}
              className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-sm text-deck-200 outline-none hover:bg-deck-700 focus:bg-deck-700"
            >
              {o.icon && <Icon name={o.icon} />}
              <span className="flex-1">{o.label}</span>
              <span className="w-3 shrink-0 text-grass-400">{o.value === value ? '✓' : ''}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
