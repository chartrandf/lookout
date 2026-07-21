import type { CiState } from '../types'

// Board filter: selected repos ("projects") and CI buckets. An empty list means "no filter on this field".
export type BoardFilter = { repos: string[]; ci: string[] }

export const emptyFilter: BoardFilter = { repos: [], ci: [] }

export const filterActive = (f: BoardFilter): boolean => f.repos.length > 0 || f.ci.length > 0

// A card matches when its repo passes the repo filter AND its CI bucket passes the CI filter.
// CI null is bucketed as 'none' so "no CI" is selectable.
export const matchesFilter = (f: BoardFilter, repo: string, ci: CiState): boolean =>
  (f.repos.length === 0 || f.repos.includes(repo)) && (f.ci.length === 0 || f.ci.includes(ci ?? 'none'))
