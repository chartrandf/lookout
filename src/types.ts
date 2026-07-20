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
  column?: PrColumn // only set for my-PR tasks adapted from a MyPr — drives PR-board button conditions
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

// which board a configurable action button belongs to
export type ButtonBoard = 'review' | 'pr'

// task fields a button's visibility can be gated on (values are matched as strings)
export type ButtonConditionField = 'stage' | 'column' | 'ciState' | 'prState' | 'hasSession'

// one gate: the task's `field` value must be one of `values`. A button ANDs all its conditions.
export type ButtonCondition = {
  field: ButtonConditionField
  values: string[]
}

// a user-defined action button shown in the session panel for a given board.
// `prompt` is sent to `claude -p` (a /slash command or a full prompt); placeholders <pr_id>, <branch_name>.
export type ActionButton = {
  id: string
  label: string
  icon?: string // key into the shared ActionIcon set; defaults to 'play'
  prompt: string
  conditions: ButtonCondition[] // empty = always visible
  advanceTo?: Stage // review board only: move the card to this stage when the run completes
}

export type Config = {
  githubUser: string // GitHub login (e.g. chartrandf)
  githubName: string // GitHub profile / git author name (e.g. Francis Chartrand) — used to match my commits
  repos: WatchedRepo[]
  reviewButtons: ActionButton[]
  prButtons: ActionButton[]
}
