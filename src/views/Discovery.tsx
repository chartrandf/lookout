import { PrLink } from '../components/PrLink'
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
}

const avatarUrl = (login: string) => `https://github.com/${login}.png?size=48`

export const Discovery = ({ tasks, onReview, onWatch, onIgnore, showIgnored, onToggleIgnored, onUnignore }: Props) => {
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

      {discovered.length === 0 && <p className="text-sm text-deck-500">Nothing new. All caught up 🎉</p>}

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
                <li key={t.id} className="flex items-center gap-3 rounded-lg border border-deck-700 bg-deck-800/60 p-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <PrLink url={t.prUrl} className="truncate font-medium">
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
                  <div className="flex shrink-0 gap-2">
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
                    <button
                      type="button"
                      onClick={() => onIgnore(t.id)}
                      className="cursor-pointer rounded-md bg-deck-700 px-3 py-1.5 text-sm hover:bg-deck-600"
                    >
                      Ignore
                    </button>
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
                <button
                  type="button"
                  onClick={() => onUnignore(t.id)}
                  className="cursor-pointer text-xs text-deck-400 hover:text-deck-200"
                >
                  unignore
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
