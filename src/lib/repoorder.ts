import type { WatchedRepo } from '../types'

// Rank of a repo name in a manual order; unknown names sort after the known ones.
const rank = (names: string[], repo: string) => {
  const i = names.indexOf(repo)
  return i < 0 ? names.length : i
}

// Move `dragged` to sit just before `before` (or to the end when before is null) in a repo-name order.
export const moveRepoBefore = (names: string[], dragged: string, before: string | null): string[] => {
  if (before === dragged) return names
  const rest = names.filter((n) => n !== dragged)
  const idx = before ? rest.indexOf(before) : rest.length
  const at = idx < 0 ? rest.length : idx
  return [...rest.slice(0, at), dragged, ...rest.slice(at)]
}

// Re-sort watched repos to follow a repo-name order. Several clones of the same repo keep their
// relative order (sort is stable), so the config list stays grouped by repo.
export const sortReposByNames = (repos: WatchedRepo[], names: string[]): WatchedRepo[] =>
  [...repos].sort((a, b) => rank(names, a.repo) - rank(names, b.repo))
