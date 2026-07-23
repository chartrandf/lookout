import { useEffect, useRef, useState } from 'react'
import { timeAgo } from '../lib/time'
import type { AppNotification } from '../types'

const svgAttrs = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

const BellIcon = () => (
  <svg {...svgAttrs} aria-hidden="true">
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
  </svg>
)

const CheckIcon = () => (
  <svg {...svgAttrs} aria-hidden="true">
    <path d="M20 6 9 17l-5-5" />
  </svg>
)

const ArchiveIcon = () => (
  <svg {...svgAttrs} aria-hidden="true">
    <rect x="3" y="4" width="18" height="4" rx="1" />
    <path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8" />
    <path d="M10 12h4" />
  </svg>
)

type Props = {
  notifications: AppNotification[]
  onOpen: (n: AppNotification) => void
  onMarkAllRead: () => void
  onArchiveAll: () => void
}

export const NotificationBell = ({ notifications, onOpen, onMarkAllRead, onArchiveAll }: Props) => {
  const [open, setOpen] = useState(false) // mounted (kept during exit animation)
  const [shown, setShown] = useState(false) // drives the fade/collapse transition
  const wrapRef = useRef<HTMLDivElement>(null)

  const unread = notifications.filter((n) => !n.read).length
  const hasAny = notifications.length > 0

  // once mounted, flip to shown on the next frame so the enter transition runs
  useEffect(() => {
    if (!open) return
    const id = requestAnimationFrame(() => setShown(true))
    return () => cancelAnimationFrame(id)
  }, [open])

  const close = () => {
    setShown(false)
    setTimeout(() => setOpen(false), 200) // let the exit transition finish
  }

  // dismiss when clicking outside or pressing Esc
  // biome-ignore lint/correctness/useExhaustiveDependencies: close is stable enough for these listeners
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) close()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('mousedown', onClick)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onClick)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        title="Notifications"
        className={`relative cursor-pointer rounded-md px-2 py-2 ${open ? 'z-30 bg-deck-700 text-white' : 'text-deck-400 hover:text-deck-200'}`}
      >
        <BellIcon />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 rounded-full bg-amber-500 px-1.5 text-xs text-black">
            {unread}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* full-screen blur behind the panel, mirroring the side panel backdrop */}
          {/* biome-ignore lint/a11y/noStaticElementInteractions: click-away backdrop */}
          {/* biome-ignore lint/a11y/useKeyWithClickEvents: click-away backdrop */}
          <div
            onClick={close}
            className={`fixed inset-0 z-20 bg-black/30 backdrop-blur-sm transition-opacity duration-200 ${shown ? 'opacity-100' : 'opacity-0'}`}
          />
          <div
            className={`absolute right-0 top-full z-30 mt-1 w-96 origin-top rounded-lg border border-deck-700 bg-deck-900 shadow-xl transition-all duration-200 ease-out ${shown ? 'scale-100 opacity-100' : '-translate-y-1 scale-95 opacity-0'}`}
          >
            <div className="flex items-center justify-between border-b border-deck-800 px-3 py-2">
              <span className="text-sm text-deck-300">Notifications</span>
              {hasAny && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={onMarkAllRead}
                    disabled={unread === 0}
                    title="Mark all as read"
                    className="cursor-pointer rounded p-1 text-deck-400 hover:bg-deck-800 hover:text-deck-200 disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-deck-400"
                  >
                    <CheckIcon />
                  </button>
                  <button
                    type="button"
                    onClick={onArchiveAll}
                    title="Archive all notifications"
                    className="cursor-pointer rounded p-1 text-deck-400 hover:bg-deck-800 hover:text-deck-200"
                  >
                    <ArchiveIcon />
                  </button>
                </div>
              )}
            </div>
            <div className="max-h-96 overflow-y-auto">
              {notifications.length === 0 && (
                <div className="px-3 py-6 text-center text-sm text-deck-500">No notifications</div>
              )}
              {notifications.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => {
                    close()
                    onOpen(n)
                  }}
                  className="flex w-full cursor-pointer items-start gap-2 border-b border-deck-800 px-3 py-2 text-left last:border-b-0 hover:bg-deck-800"
                >
                  <span
                    className={`mt-1.5 size-1.5 shrink-0 rounded-full ${n.read ? 'bg-transparent' : 'bg-amber-500'}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-sm ${n.read ? 'text-deck-400' : 'text-deck-100'}`}>
                      {n.title}
                    </span>
                    <span className="block truncate text-xs text-deck-500">{n.body}</span>
                  </span>
                  <span className="shrink-0 text-xs text-deck-600">{timeAgo(n.createdAt)}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
