import { useState } from 'react'
import { PrLink } from '../components/PrLink'
import { avatarUrl } from '../lib/avatar'
import { timeAgo } from '../lib/time'
import type { ReviewTask } from '../types'

type Props = {
  tasks: ReviewTask[]
  onReview: (id: string) => void
  onWatch: (id: string) => void
  onIgnore: (id: string) => void
  showIgnored: boolean
  onToggleIgnored: () => void
  onUnignore: (id: string) => void
  onSetSeen: (id: string, seen: boolean) => void
}

// per-row "⋯" menu: mark seen/unseen + ignore/unignore, the option shown depending on the row's state
const RowMenu = ({
  task,
  onIgnore,
  onUnignore,
  onSetSeen,
}: {
  task: ReviewTask
  onIgnore: (id: string) => void
  onUnignore: (id: string) => void
  onSetSeen: (id: string, seen: boolean) => void
}) => {
  const [open, setOpen] = useState(false)
  const item = 'cursor-pointer px-3 py-1.5 text-left text-xs text-deck-200 hover:bg-deck-700'
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="More options"
        className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-deck-600 text-deck-300 hover:bg-deck-700"
      >
        ⋯
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-30 cursor-default"
          />
          <div className="absolute right-0 top-full z-40 mt-1 flex w-44 flex-col rounded-md border border-deck-700 bg-deck-800 py-1 shadow-xl">
            <button
              type="button"
              onClick={() => {
                onSetSeen(task.id, !task.seen)
                setOpen(false)
              }}
              className={item}
            >
              {task.seen ? 'Mark as unseen' : 'Mark as seen'}
            </button>
            {task.stage === 'ignored' ? (
              <button
                type="button"
                onClick={() => {
                  onUnignore(task.id)
                  setOpen(false)
                }}
                className={item}
              >
                Unignore
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  onIgnore(task.id)
                  setOpen(false)
                }}
                className={item}
              >
                Ignore
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export const Discovery = ({
  tasks,
  onReview,
  onWatch,
  onIgnore,
  showIgnored,
  onToggleIgnored,
  onUnignore,
  onSetSeen,
}: Props) => {
  const discovered = tasks
    .filter((t) => t.stage === 'discovered' && t.prState === 'open')
    .sort(
      (a, b) =>
        Number(b.reviewRequested) - Number(a.reviewRequested) ||
        (b.prCreatedAt ?? '').localeCompare(a.prCreatedAt ?? ''),
    )
  const ignored = tasks.filter((t) => t.stage === 'ignored' && t.prState === 'open')

  const repos = [...new Set(discovered.map((t) => t.repo))].sort()

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          New pull requests <span className="text-sm font-normal text-deck-400">({discovered.length})</span>
        </h2>
        <button
          type="button"
          onClick={onToggleIgnored}
          className="cursor-pointer text-xs text-deck-400 hover:text-deck-200"
        >
          {showIgnored ? 'hide ignored' : `show ignored (${ignored.length})`}
        </button>
      </div>

      {discovered.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-24 text-center">
          <span className="text-6xl">🎉</span>
          <p className="font-script text-3xl text-grass-300">All caught up!</p>
          <p className="text-sm text-deck-400">No new pull requests waiting for you. Go grab a coffee ☕</p>
        </div>
      )}

      {repos.map((repo) => (
        <section key={repo}>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-deck-200">
            {repo}
            <span className="rounded bg-deck-700 px-1.5 py-0.5 text-xs font-normal text-deck-400">
              {discovered.filter((t) => t.repo === repo).length}
            </span>
          </h3>
          <ul className="flex flex-col gap-2">
            {discovered
              .filter((t) => t.repo === repo)
              .map((t) => (
                <li
                  key={t.id}
                  className={`flex items-center gap-3 rounded-lg border p-3 ${
                    t.seen ? 'border-deck-700 bg-deck-800/60' : 'border-grass-600/60 bg-grass-600/10'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {!t.seen && (
                        <span className="h-2 w-2 shrink-0 rounded-full bg-grass-400" title="New — not seen yet" />
                      )}
                      <PrLink
                        url={t.prUrl}
                        repo={t.repo}
                        prNumber={t.prNumber}
                        onClick={() => onSetSeen(t.id, true)}
                        className="truncate font-medium"
                      >
                        {t.prTitle}
                      </PrLink>
                      <span className="shrink-0 text-xs text-deck-500">#{t.prNumber}</span>
                      {t.reviewRequested && (
                        <span className="shrink-0 rounded bg-amber-500/20 px-1.5 py-0.5 text-xs text-amber-300">
                          review requested
                        </span>
                      )}
                    </div>
                    <div className="mt-1.5 flex items-center gap-2 text-xs text-deck-400">
                      <img src={avatarUrl(t.prAuthor)} alt={t.prAuthor} className="h-5 w-5 rounded-full" />
                      <span className="font-medium text-deck-300">{t.prAuthor}</span>
                      <span className="rounded bg-grass-600/20 px-1.5 py-0.5 font-medium text-grass-300">
                        opened {timeAgo(t.prCreatedAt)}
                      </span>
                      <span className="truncate rounded bg-deck-700 px-1.5 py-0.5 font-mono">{t.branch}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      title="Add to board + start /do-review now"
                      onClick={() => onReview(t.id)}
                      className="cursor-pointer rounded-md bg-grass-600 px-3 py-1.5 text-sm hover:bg-grass-500"
                    >
                      Review
                    </button>
                    <button
                      type="button"
                      onClick={() => onWatch(t.id)}
                      className="cursor-pointer rounded-md border border-grass-600 px-3 py-1.5 text-sm text-grass-300 hover:bg-grass-600/20"
                    >
                      Watch
                    </button>
                    <RowMenu task={t} onIgnore={onIgnore} onUnignore={onUnignore} onSetSeen={onSetSeen} />
                  </div>
                </li>
              ))}
          </ul>
        </section>
      ))}

      {showIgnored && ignored.length > 0 && (
        <div className="mt-4">
          <h3 className="mb-2 text-sm font-semibold text-deck-400">Ignored</h3>
          <ul className="flex flex-col gap-1">
            {ignored.map((t) => (
              <li
                key={t.id}
                className="flex items-center gap-3 rounded border border-deck-800 p-2 text-sm text-deck-500"
              >
                <span className="min-w-0 flex-1 truncate">
                  {t.repo}#{t.prNumber} — {t.prTitle}
                </span>
                <RowMenu task={t} onIgnore={onIgnore} onUnignore={onUnignore} onSetSeen={onSetSeen} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
