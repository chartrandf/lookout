import { PrLink } from '../components/PrLink'
import type { ReviewTask, Stage } from '../types'

type Props = { tasks: ReviewTask[] }

const COLUMNS: { stage: Stage[]; title: string }[] = [
  { stage: ['watching'], title: 'Watching' },
  { stage: ['inbox'], title: 'Needs Review' },
  { stage: ['reviewing'], title: 'In Review' },
  { stage: ['reviewed'], title: 'Reviewed' },
  { stage: ['followup'], title: 'Follow-up' },
  { stage: ['done'], title: 'Done' },
]

const DONE_TTL_MS = 24 * 60 * 60 * 1000

const Card = ({ t }: { t: ReviewTask }) => (
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
    </div>
  </div>
)

export const Board = ({ tasks }: Props) => {
  const now = Date.now()
  const visible = tasks.filter(
    (t) => !(t.stage === 'done' && t.doneAt && now - new Date(t.doneAt).getTime() > DONE_TTL_MS),
  )

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
              <Card key={t.id} t={t} />
            ))}
          </div>
        )
      })}
    </div>
  )
}
