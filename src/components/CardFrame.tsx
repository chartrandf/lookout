import type { DragEvent, ReactNode } from 'react'
import { avatarUrl } from '../lib/avatar'

type Props = {
  title: string
  author: string
  repo: string // owner/repo
  prNumber: number
  className?: string // extra classes layered on the base card style
  onClick?: () => void
  draggable?: boolean
  onDragStart?: (e: DragEvent) => void
  onDragEnd?: () => void
  children?: ReactNode // the tag row
}

const BASE =
  'cursor-pointer rounded-lg border border-deck-700 bg-deck-800/80 p-3 transition-colors duration-150 hover:border-deck-600 hover:bg-white/10'

// Shared presentational card shell: title, author + repo#number row, and a tag-row slot.
// Used by the Reviews board and the Pull Requests board so both cards read identically.
export const CardFrame = ({
  title,
  author,
  repo,
  prNumber,
  className,
  onClick,
  draggable,
  onDragStart,
  onDragEnd,
  children,
}: Props) => (
  // biome-ignore lint/a11y/useKeyWithClickEvents: card body is a mouse affordance; actions inside are buttons
  // biome-ignore lint/a11y/noStaticElementInteractions: card body is a mouse/drag affordance
  <div
    onClick={onClick}
    draggable={draggable}
    onDragStart={onDragStart}
    onDragEnd={onDragEnd}
    className={`${BASE} ${className ?? ''}`}
  >
    <p className="text-sm font-medium leading-snug">{title}</p>
    <div className="mt-1.5 flex items-center gap-1.5 text-xs text-deck-400">
      <img src={avatarUrl(author)} alt={author} className="h-4 w-4 rounded-full" />
      <span className="truncate font-medium text-deck-300">{author}</span>
      <span className="ml-auto shrink-0">
        {repo.split('/')[1]}#{prNumber}
      </span>
    </div>
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-deck-400">{children}</div>
  </div>
)
