export type Stage = 'discovered' | 'watching' | 'ignored' | 'inbox' | 'reviewing' | 'reviewed' | 'followup' | 'done'

export type PrState = 'open' | 'merged' | 'closed'

export type CiState = 'pass' | 'fail' | 'pending' | null

// which column a PR I authored lands in on the Pull Requests board
export type PrColumn = 'waiting' | 'in_review' | 'ready' | 'done'

// the latest review verdict from a given side (human or bot); null = none yet
export type ReviewFlavor = 'approved' | 'changes_requested' | 'commented' | null

// a pull request authored by me — columns are derived live from GitHub each sync
export type MyPr = {
  id: string // owner/repo#number
  repo: string
  repoPath: string | null
  number: number
  title: string
  url: string
  branch: string
  createdAt: string
  state: PrState
  isDraft: boolean
  column: PrColumn // effective column (manual override applied)
  derivedColumn: PrColumn // column purely from GitHub state (override baseline)
  humanReview: ReviewFlavor
  botReview: ReviewFlavor
  ciState: CiState
}

// a manual hand-off: pin `column`, recorded against the GitHub-derived column at drop time.
// When the derived column later moves off `baseline`, the override is stale and gets dropped.
export type PrOverride = { column: PrColumn; baseline: PrColumn }

export type FollowupSummary = {
  addressed: number
  partial: number
  pending: number
}

export type ReviewTask = {
  id: string // owner/repo#number
  repo: string
  repoPath: string | null
  branch: string
  prNumber: number
  prTitle: string
  prUrl: string
  prState: PrState
  prAuthor: string
  prCreatedAt: string | null
  stage: Stage
  reviewRequested: boolean
  sessionIds: string[]
  reviewFiles: string[]
  followupSummary: FollowupSummary | null
  activityCount: number | null
  ciState: 'pass' | 'fail' | 'pending' | null
  hasNewActivity: boolean
  snoozed: boolean
  seen: boolean // acknowledged in Discovery (clears the "new" highlight and drops it from the count)
  sortOrder: number | null
  doneAt: string | null
  updatedAt: string
}

export type AppNotification = {
  id: number
  taskId: string
  title: string
  body: string
  read: boolean
  createdAt: string
}

export type WatchedRepo = {
  repo: string // owner/repo
  path: string // local clone path
}

export type Commands = {
  review: string
  followup: string
  handleReview: string
  handleCi: string
}

export type Config = {
  githubUser: string // GitHub login (e.g. chartrandf)
  githubName: string // GitHub profile / git author name (e.g. Francis Chartrand) — used to match my commits
  repos: WatchedRepo[]
  commands: Commands
}
