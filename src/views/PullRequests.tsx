import { useState } from 'react'
import { CardFrame } from '../components/CardFrame'
import { openPrWindow } from '../lib/prwindow'
import type { CiState, MyPr, PrColumn, ReviewFlavor } from '../types'

type Props = {
  prs: MyPr[]
  me: string
  onHandleReview: (pr: MyPr) => void
  onMove: (id: string, column: PrColumn) => void
}

const COLUMNS: { column: PrColumn; title: string }[] = [
  { column: 'waiting', title: 'Waiting' },
  { column: 'in_review', title: 'In Review' },
  { column: 'ready', title: 'Ready to merge' },
]

const FLAVOR_LABEL: Record<Exclude<ReviewFlavor, null>, string> = {
  approved: 'approved',
  changes_requested: 'changes',
  commented: 'commented',
}

const flavorClass = (f: Exclude<ReviewFlavor, null>): string =>
  f === 'approved'
    ? 'bg-grass-500/20 text-grass-300'
    : f === 'changes_requested'
      ? 'bg-amber-500/20 text-amber-300'
      : 'bg-sky-500/20 text-sky-300'

// human review is what I'm waiting for → labelled plainly; bot review is an assist → prefixed 🤖
const ReviewTag = ({ flavor, bot }: { flavor: ReviewFlavor; bot?: boolean }) =>
  flavor ? (
    <span className={`rounded px-1 py-0.5 ${bot ? 'bg-deck-700 text-deck-300' : flavorClass(flavor)}`}>
      {bot ? '🤖 ' : ''}
      {FLAVOR_LABEL[flavor]}
    </span>
  ) : null

const CiTag = ({ ci }: { ci: CiState }) => {
  if (ci === 'pass') return <span className="rounded bg-grass-500/20 px-1 py-0.5 text-grass-300">CI ✓</span>
  if (ci === 'fail') return <span className="rounded bg-red-500/20 px-1 py-0.5 text-red-300">CI ✗</span>
  if (ci === 'pending') return <span className="rounded bg-deck-700 px-1 py-0.5 text-deck-400">CI …</span>
  return null
}

const PrCard = ({
  pr,
  me,
  onHandleReview,
  onDragStart,
  onDragEnd,
}: {
  pr: MyPr
  me: string
  onHandleReview: (pr: MyPr) => void
  onDragStart: () => void
  onDragEnd: () => void
}) => (
  <CardFrame
    title={pr.title}
    author={me}
    repo={pr.repo}
    prNumber={pr.number}
    onClick={() => openPrWindow(pr.url, pr.repo, pr.number)}
    draggable
    onDragStart={(e) => {
      // WebKit requires setData for the drag to actually start
      e.dataTransfer.setData('text/plain', pr.id)
      e.dataTransfer.effectAllowed = 'move'
      onDragStart()
    }}
    onDragEnd={onDragEnd}
  >
    {pr.isDraft && <span className="rounded bg-deck-700 px-1 py-0.5 text-deck-400">draft</span>}
    <ReviewTag flavor={pr.humanReview} />
    <ReviewTag flavor={pr.botReview} bot />
    <CiTag ci={pr.ciState} />
    {pr.column === 'in_review' && (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onHandleReview(pr)
        }}
        title="Run /handle-review on this PR"
        className="ml-auto cursor-pointer rounded bg-grass-600 px-1.5 py-0.5 font-medium text-grass-50 hover:bg-grass-500"
      >
        handle review
      </button>
    )}
  </CardFrame>
)

type ColumnProps = {
  title: string
  prs: MyPr[]
  me: string
  onHandleReview: (pr: MyPr) => void
  dragging: boolean
  isDropTarget: boolean
  onDragOver: () => void
  onDrop: () => void
  onCardDragStart: (id: string) => void
  onCardDragEnd: () => void
}

const Column = ({
  title,
  prs,
  me,
  onHandleReview,
  dragging,
  isDropTarget,
  onDragOver,
  onDrop,
  onCardDragStart,
  onCardDragEnd,
}: ColumnProps) => (
  // biome-ignore lint/a11y/noStaticElementInteractions: kanban drop target
  <div
    onDragOver={(e) => {
      if (!dragging) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      onDragOver()
    }}
    onDrop={(e) => {
      e.preventDefault()
      onDrop()
    }}
    className={`flex min-h-0 flex-1 flex-col gap-2 rounded-lg p-2 transition-colors duration-150 ${
      isDropTarget ? 'bg-grass-600/30 ring-1 ring-grass-500' : dragging ? 'bg-grass-600/20' : 'bg-grass-600/10'
    }`}
  >
    <h3 className="shrink-0 px-1 text-xs font-semibold uppercase tracking-wide text-deck-300">
      {title} <span className="font-normal text-deck-400">({prs.length})</span>
    </h3>
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
      {prs.map((pr) => (
        <PrCard
          key={pr.id}
          pr={pr}
          me={me}
          onHandleReview={onHandleReview}
          onDragStart={() => onCardDragStart(pr.id)}
          onDragEnd={onCardDragEnd}
        />
      ))}
    </div>
  </div>
)

export const PullRequests = ({ prs, me, onHandleReview, onMove }: Props) => {
  const [showDone, setShowDone] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropCol, setDropCol] = useState<PrColumn | null>(null)
  const byColumn = (c: PrColumn) =>
    prs.filter((p) => p.column === c).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const doneCount = prs.filter((p) => p.column === 'done').length
  const columns = showDone ? [...COLUMNS, { column: 'done' as const, title: 'Done' }] : COLUMNS

  const drop = (column: PrColumn) => {
    if (dragId) onMove(dragId, column)
    setDragId(null)
    setDropCol(null)
  }

  return (
    <div className="flex h-full flex-col gap-3">
      {doneCount > 0 && (
        <button
          type="button"
          onClick={() => setShowDone((s) => !s)}
          className="shrink-0 cursor-pointer self-end text-xs text-deck-400 hover:text-deck-200"
        >
          {showDone ? 'hide done' : `show done (${doneCount})`}
        </button>
      )}
      <div className="flex min-h-0 flex-1 gap-3">
        {columns.map((col) => (
          <Column
            key={col.column}
            title={col.title}
            prs={byColumn(col.column)}
            me={me}
            onHandleReview={onHandleReview}
            dragging={dragId !== null}
            isDropTarget={dropCol === col.column && dragId !== null}
            onDragOver={() => setDropCol(col.column)}
            onDrop={() => drop(col.column)}
            onCardDragStart={setDragId}
            onCardDragEnd={() => {
              setDragId(null)
              setDropCol(null)
            }}
          />
        ))}
      </div>
    </div>
  )
}
