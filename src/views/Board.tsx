import { useState } from 'react'
import { avatarUrl } from '../lib/avatar'
import type { Run } from '../lib/runs'
import type { ReviewTask, Stage } from '../types'

type Props = {
  tasks: ReviewTask[]
  runs: Run[]
  onOpenSession: (t: ReviewTask) => void
  onSeen: (t: ReviewTask) => void
  onReorder: (t: ReviewTask, stage: Stage, orderedIds: string[]) => void
}

const COLUMNS: { stage: Stage[]; title: string }[] = [
  { stage: ['watching'], title: 'Watching' },
  { stage: ['inbox'], title: 'Needs Review' },
  { stage: ['reviewing'], title: 'In Review' },
  { stage: ['reviewed'], title: 'Reviewed' },
  { stage: ['followup'], title: 'Follow-up' },
  { stage: ['done'], title: 'Done' },
]

const DONE_TTL_MS = 24 * 60 * 60 * 1000

type CardProps = {
  t: ReviewTask
  run: Run | undefined
  onOpen: () => void
  onSeen: () => void
  onDragStart: () => void
  onDragEnd: () => void
  onDropBefore: () => void
}

const Card = ({ t, run, onOpen, onSeen, onDragStart, onDragEnd, onDropBefore }: CardProps) => (
  // biome-ignore lint/a11y/useKeyWithClickEvents: card body is a mouse affordance; actions inside are buttons
  <div
    onClick={onOpen}
    draggable
    onDragStart={(e) => {
      // WebKit requires setData for the drag to actually start
      e.dataTransfer.setData('text/plain', t.id)
      e.dataTransfer.effectAllowed = 'move'
      onDragStart()
    }}
    onDragEnd={onDragEnd}
    onDragOver={(e) => {
      e.preventDefault()
      e.stopPropagation()
      e.dataTransfer.dropEffect = 'move'
    }}
    onDrop={(e) => {
      e.preventDefault()
      e.stopPropagation()
      onDropBefore()
    }}
    className={`cursor-pointer rounded-lg border border-deck-700 bg-deck-800/80 p-3 transition-colors duration-150 hover:border-deck-600 hover:bg-white/10 ${t.snoozed ? 'opacity-50' : ''} ${run?.status === 'running' ? 'card-running' : ''}`}
  >
    <p className="text-sm font-medium leading-snug">{t.prTitle}</p>
    <div className="mt-1.5 flex items-center gap-1.5 text-xs text-deck-400">
      <img src={avatarUrl(t.prAuthor)} alt={t.prAuthor} className="h-4 w-4 rounded-full" />
      <span className="truncate font-medium text-deck-300">{t.prAuthor}</span>
      <span className="ml-auto shrink-0">
        {t.repo.split('/')[1]}#{t.prNumber}
      </span>
    </div>
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-deck-400">
      {t.prState !== 'open' && (
        <span
          className={`rounded px-1 py-0.5 ${t.prState === 'merged' ? 'bg-purple-500/20 text-purple-300' : 'bg-red-500/20 text-red-300'}`}
        >
          {t.prState}
        </span>
      )}
      {run?.status === 'running' && (
        <span className="animate-pulse rounded bg-amber-500/20 px-1 py-0.5 text-amber-300">running</span>
      )}
      {run?.status === 'awaiting-input' && (
        <span className="rounded bg-grass-500/20 px-1 py-0.5 text-grass-300">awaiting input</span>
      )}
      {t.sessionIds.length > 0 && (
        <span className="rounded bg-grass-500/20 px-1 py-0.5 text-grass-300" title={t.sessionIds.join('\n')}>
          {t.sessionIds.length} session{t.sessionIds.length > 1 ? 's' : ''}
        </span>
      )}
      {t.reviewFiles.length > 0 && (
        <span className="rounded bg-grass-500/20 px-1 py-0.5 text-grass-300" title={t.reviewFiles.join('\n')}>
          {t.reviewFiles.length} review{t.reviewFiles.length > 1 ? 's' : ''}
        </span>
      )}
      {t.followupSummary && (
        <span className="rounded bg-deck-700 px-1 py-0.5">
          🚨{t.followupSummary.pending} ⚠️{t.followupSummary.partial} ✅{t.followupSummary.addressed}
        </span>
      )}
      {t.hasNewActivity && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onSeen()
          }}
          title="New comments/reviews since last look — click to dismiss"
          className="cursor-pointer rounded bg-amber-500/20 px-1 py-0.5 text-amber-300 hover:bg-amber-500/40"
        >
          💬 new
        </button>
      )}
      {t.ciState === 'fail' && <span className="rounded bg-red-500/20 px-1 py-0.5 text-red-300">CI ✗</span>}
      {t.ciState === 'pending' && <span className="rounded bg-deck-700 px-1 py-0.5 text-deck-400">CI …</span>}
    </div>
  </div>
)

export const Board = ({ tasks, runs, onOpenSession, onSeen, onReorder }: Props) => {
  const [showSnoozed, setShowSnoozed] = useState(false)
  const [dragging, setDragging] = useState<ReviewTask | null>(null)
  const [dropTarget, setDropTarget] = useState<number | null>(null)
  const now = Date.now()
  const active = tasks.filter(
    (t) => !(t.stage === 'done' && t.doneAt && now - new Date(t.doneAt).getTime() > DONE_TTL_MS),
  )
  // snoozed cards stay hidden until new activity; Done column always shows
  const visible = active.filter((t) => showSnoozed || !t.snoozed || t.stage === 'done')
  const snoozedCount = active.filter((t) => t.snoozed && t.stage !== 'done').length
  const runByTask = new Map(runs.map((r) => [r.taskId, r]))

  // drop the dragged card into a column, before `before` (or at the end)
  const drop = (colItems: ReviewTask[], stage: Stage, before: ReviewTask | null) => {
    if (!dragging) return
    const rest = colItems.filter((x) => x.id !== dragging.id)
    const idx = before ? rest.findIndex((x) => x.id === before.id) : rest.length
    const at = idx < 0 ? rest.length : idx
    const ordered = [...rest.slice(0, at), dragging, ...rest.slice(at)]
    onReorder(
      dragging,
      stage,
      ordered.map((x) => x.id),
    )
    setDragging(null)
    setDropTarget(null)
  }

  return (
    <div className="flex flex-col gap-3">
      {snoozedCount > 0 && (
        <button
          type="button"
          onClick={() => setShowSnoozed((s) => !s)}
          className="cursor-pointer self-end text-xs text-deck-400 hover:text-deck-200"
        >
          {showSnoozed ? 'hide snoozed' : `show snoozed (${snoozedCount})`}
        </button>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        {COLUMNS.map((col, colIdx) => {
          const items = visible
            .filter((t) => col.stage.includes(t.stage))
            .sort((a, b) => (a.sortOrder ?? 1e9) - (b.sortOrder ?? 1e9) || b.updatedAt.localeCompare(a.updatedAt))
          const canDrop = dragging !== null // any column: other = move stage, same = reorder
          return (
            // biome-ignore lint/a11y/noStaticElementInteractions: drop target for kanban dnd
            <div
              key={col.title}
              onDragOver={(e) => {
                if (!canDrop) return
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                setDropTarget(colIdx)
              }}
              onDragLeave={() => setDropTarget((cur) => (cur === colIdx ? null : cur))}
              onDrop={(e) => {
                e.preventDefault()
                drop(items, col.stage[0], null)
              }}
              className={`flex flex-col gap-2 rounded-lg p-2 transition-colors duration-150 ${
                dropTarget === colIdx && canDrop
                  ? 'bg-grass-600/30 ring-1 ring-grass-500'
                  : dragging
                    ? 'bg-grass-600/20'
                    : 'bg-grass-600/10'
              }`}
            >
              <h3 className="px-1 text-xs font-semibold uppercase tracking-wide text-deck-300">
                {col.title} <span className="font-normal text-deck-400">({items.length})</span>
              </h3>
              {items.map((t) => (
                <Card
                  key={t.id}
                  t={t}
                  run={runByTask.get(t.id)}
                  onOpen={() => onOpenSession(t)}
                  onSeen={() => onSeen(t)}
                  onDragStart={() => setDragging(t)}
                  onDragEnd={() => {
                    setDragging(null)
                    setDropTarget(null)
                  }}
                  onDropBefore={() => drop(items, col.stage[0], t)}
                />
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
