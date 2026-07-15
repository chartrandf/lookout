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
  column: PrColumn
  humanReview: ReviewFlavor
  botReview: ReviewFlavor
  ciState: CiState
}

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
}

export type Config = {
  githubUser: string
  repos: WatchedRepo[]
  commands: Commands
}
