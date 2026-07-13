import { useState } from 'react'
import { PrLink } from '../components/PrLink'
import type { Run } from '../lib/runs'
import type { ReviewTask, Stage } from '../types'

type Props = {
  tasks: ReviewTask[]
  runs: Run[]
  onReview: (t: ReviewTask) => void
  onFollowup: (t: ReviewTask) => void
  onOpenSession: (t: ReviewTask) => void
  onSeen: (t: ReviewTask) => void
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
  onReview: () => void
  onFollowup: () => void
  onOpen: () => void
  onSeen: () => void
}

const actionClass =
  'cursor-pointer rounded bg-deck-700 px-1.5 py-0.5 text-xs text-deck-300 hover:bg-deck-600 disabled:cursor-default disabled:opacity-40'

const Card = ({ t, run, onReview, onFollowup, onOpen, onSeen }: CardProps) => (
  // biome-ignore lint/a11y/useKeyWithClickEvents: card body is a mouse affordance; actions inside are buttons
  <div
    onClick={onOpen}
    className={`cursor-pointer rounded-lg border border-deck-700 bg-deck-800/80 p-3 hover:border-deck-600 ${t.snoozed ? 'opacity-50' : ''}`}
  >
    <PrLink url={t.prUrl} repo={t.repo} prNumber={t.prNumber} className="block text-sm font-medium leading-snug">
      {t.prTitle}
    </PrLink>
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-deck-400">
      <span>
        {t.repo.split('/')[1]}#{t.prNumber}
      </span>
      <span className="rounded bg-deck-700 px-1 py-0.5 font-mono">{t.branch}</span>
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
    {t.stage !== 'done' && (
      <div className="mt-2 flex gap-1.5">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onReview()
          }}
          disabled={run?.status === 'running'}
          className={actionClass}
        >
          ▶ review
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onFollowup()
          }}
          disabled={run?.status === 'running'}
          className={actionClass}
        >
          🔁 follow-up
        </button>
      </div>
    )}
  </div>
)

export const Board = ({ tasks, runs, onReview, onFollowup, onOpenSession, onSeen }: Props) => {
  const [showSnoozed, setShowSnoozed] = useState(false)
  const now = Date.now()
  const active = tasks.filter(
    (t) => !(t.stage === 'done' && t.doneAt && now - new Date(t.doneAt).getTime() > DONE_TTL_MS),
  )
  // snoozed cards stay hidden until new activity; Done column always shows
  const visible = active.filter((t) => showSnoozed || !t.snoozed || t.stage === 'done')
  const snoozedCount = active.filter((t) => t.snoozed && t.stage !== 'done').length
  const runByTask = new Map(runs.map((r) => [r.taskId, r]))

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
        {COLUMNS.map((col) => {
          const items = visible.filter((t) => col.stage.includes(t.stage))
          return (
            <div key={col.title} className="flex flex-col gap-2 rounded-lg bg-grass-600/10 p-2">
              <h3 className="px-1 text-xs font-semibold uppercase tracking-wide text-deck-300">
                {col.title} <span className="font-normal text-deck-400">({items.length})</span>
              </h3>
              {items.map((t) => (
                <Card
                  key={t.id}
                  t={t}
                  run={runByTask.get(t.id)}
                  onReview={() => onReview(t)}
                  onFollowup={() => onFollowup(t)}
                  onOpen={() => onOpenSession(t)}
                  onSeen={() => onSeen(t)}
                />
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
