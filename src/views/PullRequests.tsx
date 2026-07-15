import { useState } from 'react'
import { CardFrame } from '../components/CardFrame'
import { openPrWindow } from '../lib/prwindow'
import type { CiState, MyPr, PrColumn, ReviewFlavor } from '../types'

type Props = {
  prs: MyPr[]
  me: string
  onHandleReview: (pr: MyPr) => void
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

const PrCard = ({ pr, me, onHandleReview }: { pr: MyPr; me: string; onHandleReview: (pr: MyPr) => void }) => (
  <CardFrame
    title={pr.title}
    author={me}
    repo={pr.repo}
    prNumber={pr.number}
    onClick={() => openPrWindow(pr.url, pr.repo, pr.number)}
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

const Column = ({
  title,
  prs,
  me,
  onHandleReview,
}: {
  title: string
  prs: MyPr[]
  me: string
  onHandleReview: (pr: MyPr) => void
}) => (
  <div className="flex min-h-0 flex-1 flex-col gap-2 rounded-lg bg-grass-600/10 p-2">
    <h3 className="shrink-0 px-1 text-xs font-semibold uppercase tracking-wide text-deck-300">
      {title} <span className="font-normal text-deck-400">({prs.length})</span>
    </h3>
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
      {prs.map((pr) => (
        <PrCard key={pr.id} pr={pr} me={me} onHandleReview={onHandleReview} />
      ))}
    </div>
  </div>
)

export const PullRequests = ({ prs, me, onHandleReview }: Props) => {
  const [showDone, setShowDone] = useState(false)
  const byColumn = (c: PrColumn) =>
    prs.filter((p) => p.column === c).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const doneCount = prs.filter((p) => p.column === 'done').length

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
        {COLUMNS.map((col) => (
          <Column
            key={col.column}
            title={col.title}
            prs={byColumn(col.column)}
            me={me}
            onHandleReview={onHandleReview}
          />
        ))}
        {showDone && <Column title="Done" prs={byColumn('done')} me={me} onHandleReview={onHandleReview} />}
      </div>
    </div>
  )
}
