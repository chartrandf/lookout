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

// `gh repo view --json` has no autoMergeAllowed field (gh 2.102 rejects the whole call, so no Merge
// button showed anywhere): the settings come from GraphQL, the same names, in one call
export const mergeOptionsArgs = (repo: string): string[] => {
  const [owner, name] = repo.split('/')
  return [
    'api',
    'graphql',
    '-f',
    `owner=${owner}`,
    '-f',
    `name=${name}`,
    '-f',
    'query=query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { mergeCommitAllowed squashMergeAllowed rebaseMergeAllowed viewerDefaultMergeMethod autoMergeAllowed } }',
    '--jq',
    '.data.repository',
  ]
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

// The strategy auto-merge is already set to on a PR (`gh pr view --json autoMergeRequest`), or null
// when it isn't on: the panel shows "Auto-merge on" whoever enabled it, here or on GitHub
export const parseAutoMerge = (raw: { autoMergeRequest?: { mergeMethod?: string } | null }): MergeMethod | null => {
  const m = raw.autoMergeRequest?.mergeMethod?.toLowerCase()
  if (!raw.autoMergeRequest) return null
  return MERGE_METHODS.some((x) => x.value === m) ? (m as MergeMethod) : 'merge'
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
