import type { CiState, MergeMethod, MergePreference } from '../types'

// What a repo lets me do, from `gh repo view`: the strategies its settings allow, the one GitHub's
// own merge button preselects for me (the last one I used there), and whether auto-merge is on.
export type MergeOptions = { allowed: MergeMethod[]; viewerDefault: MergeMethod | null; autoMerge: boolean }

// GitHub's order and wording, so the menu reads like the one on the PR page
export const MERGE_METHODS: { value: MergeMethod; label: string }[] = [
  { value: 'merge', label: 'Create a merge commit' },
  { value: 'squash', label: 'Squash and merge' },
  { value: 'rebase', label: 'Rebase and merge' },
]

export type GhMergeSettings = {
  mergeCommitAllowed: boolean
  squashMergeAllowed: boolean
  rebaseMergeAllowed: boolean
  viewerDefaultMergeMethod?: string
  autoMergeAllowed?: boolean
}

export const parseMergeOptions = (raw: GhMergeSettings): MergeOptions => {
  const on: Record<MergeMethod, boolean> = {
    merge: raw.mergeCommitAllowed,
    squash: raw.squashMergeAllowed,
    rebase: raw.rebaseMergeAllowed,
  }
  const def = raw.viewerDefaultMergeMethod?.toLowerCase()
  return {
    allowed: MERGE_METHODS.map((m) => m.value).filter((m) => on[m]),
    viewerDefault: MERGE_METHODS.some((m) => m.value === def) ? (def as MergeMethod) : null,
    autoMerge: !!raw.autoMergeAllowed,
  }
}

// The strategy the Merge button uses: my Settings preference when the repo allows it, else my GitHub
// default, else whatever the repo allows first. null = the repo allows none (can't merge from here).
export const pickMethod = (o: MergeOptions, pref: MergePreference): MergeMethod | null => {
  if (pref !== 'github' && o.allowed.includes(pref)) return pref
  if (o.viewerDefault && o.allowed.includes(o.viewerDefault)) return o.viewerDefault
  return o.allowed[0] ?? null
}

// Auto-merge leads the Merge button while CI still runs; once green a plain merge leads and auto-merge
// waits in the menu.
export const defaultAuto = (o: MergeOptions, ci: CiState): boolean => o.autoMerge && ci === 'pending'

// auto: GitHub merges with this strategy once the PR's requirements pass
export const mergeArgs = (repo: string, prNumber: number, method: MergeMethod, auto = false): string[] => [
  'pr',
  'merge',
  String(prNumber),
  '--repo',
  repo,
  `--${method}`,
  ...(auto ? ['--auto'] : []),
]
