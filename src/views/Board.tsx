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
  onOpenSession: () => void
  onSeen: () => void
}

const actionClass =
  'cursor-pointer rounded bg-zinc-700 px-1.5 py-0.5 text-xs text-zinc-300 hover:bg-zinc-600 disabled:cursor-default disabled:opacity-40'

const Card = ({ t, run, onReview, onFollowup, onOpenSession, onSeen }: CardProps) => (
  <div className="rounded-lg border border-zinc-700 bg-zinc-800/60 p-3">
    <PrLink url={t.prUrl} className="block text-sm font-medium leading-snug">
      {t.prTitle}
    </PrLink>
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-zinc-400">
      <span>
        {t.repo.split('/')[1]}#{t.prNumber}
      </span>
      <span className="rounded bg-zinc-700 px-1 py-0.5 font-mono">{t.branch}</span>
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
        <span className="rounded bg-emerald-500/20 px-1 py-0.5 text-emerald-300">awaiting input</span>
      )}
      {t.sessionIds.length > 0 && (
        <span className="rounded bg-sky-500/20 px-1 py-0.5 text-sky-300" title={t.sessionIds.join('\n')}>
          {t.sessionIds.length} session{t.sessionIds.length > 1 ? 's' : ''}
        </span>
      )}
      {t.reviewFiles.length > 0 && (
        <span className="rounded bg-emerald-500/20 px-1 py-0.5 text-emerald-300" title={t.reviewFiles.join('\n')}>
          {t.reviewFiles.length} review{t.reviewFiles.length > 1 ? 's' : ''}
        </span>
      )}
      {t.followupSummary && (
        <span className="rounded bg-zinc-700 px-1 py-0.5">
          🚨{t.followupSummary.pending} ⚠️{t.followupSummary.partial} ✅{t.followupSummary.addressed}
        </span>
      )}
      {t.hasNewActivity && (
        <button
          type="button"
          onClick={onSeen}
          title="New comments/reviews since last look — click to dismiss"
          className="cursor-pointer rounded bg-amber-500/20 px-1 py-0.5 text-amber-300 hover:bg-amber-500/40"
        >
          💬 new
        </button>
      )}
      {t.ciState === 'fail' && <span className="rounded bg-red-500/20 px-1 py-0.5 text-red-300">CI ✗</span>}
      {t.ciState === 'pending' && <span className="rounded bg-zinc-700 px-1 py-0.5 text-zinc-400">CI …</span>}
    </div>
    {t.stage !== 'done' && (
      <div className="mt-2 flex gap-1.5">
        <button type="button" onClick={onReview} disabled={run?.status === 'running'} className={actionClass}>
          ▶ review
        </button>
        <button type="button" onClick={onFollowup} disabled={run?.status === 'running'} className={actionClass}>
          follow-up
        </button>
        {(run || t.sessionIds.length > 0) && (
          <button type="button" onClick={onOpenSession} className={actionClass}>
            session
          </button>
        )}
      </div>
    )}
  </div>
)

export const Board = ({ tasks, runs, onReview, onFollowup, onOpenSession, onSeen }: Props) => {
  const now = Date.now()
  const visible = tasks.filter(
    (t) => !(t.stage === 'done' && t.doneAt && now - new Date(t.doneAt).getTime() > DONE_TTL_MS),
  )
  const runByTask = new Map(runs.map((r) => [r.taskId, r]))

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
      {COLUMNS.map((col) => {
        const items = visible.filter((t) => col.stage.includes(t.stage))
        return (
          <div key={col.title} className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              {col.title} <span className="font-normal">({items.length})</span>
            </h3>
            {items.map((t) => (
              <Card
                key={t.id}
                t={t}
                run={runByTask.get(t.id)}
                onReview={() => onReview(t)}
                onFollowup={() => onFollowup(t)}
                onOpenSession={() => onOpenSession(t)}
                onSeen={() => onSeen(t)}
              />
            ))}
          </div>
        )
      })}
    </div>
  )
}
