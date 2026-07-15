import type { CiState, MyPr, PrColumn, PrState, ReviewFlavor } from '../types'
import type { GhMyPr } from './gh'

// Collapse a statusCheckRollup array into a single CI verdict (fail > pending > pass; empty = null).
// Pure so both the classifier and gh.ts (fetchPrActivity) share one source of truth.
export const rollupToCiState = (checks: { conclusion?: string; status?: string; state?: string }[]): CiState => {
  if (!checks.length) return null
  const states = checks.map((c) => (c.conclusion || c.state || c.status || '').toUpperCase())
  if (states.some((s) => s === 'FAILURE' || s === 'ERROR')) return 'fail'
  if (states.some((s) => s === '' || s === 'PENDING' || s === 'IN_PROGRESS' || s === 'QUEUED')) return 'pending'
  return 'pass'
}

type ReviewAuthor = { login: string; is_bot?: boolean } | null
type Review = { author: ReviewAuthor; state: string }

// GitHub's `[bot]` login suffix, or the explicit is_bot flag
export const isBot = (author: ReviewAuthor): boolean =>
  author?.is_bot === true || Boolean(author?.login?.endsWith('[bot]'))

// The latest verdict across a set of reviews: changes_requested wins over approved wins over commented.
// (A single reviewer's latest review is what gh returns in latestReviews, so this collapses multiple reviewers.)
export const reviewFlavor = (reviews: Review[]): ReviewFlavor => {
  if (!reviews.length) return null
  const states = reviews.map((r) => r.state.toUpperCase())
  if (states.includes('CHANGES_REQUESTED')) return 'changes_requested'
  if (states.includes('APPROVED')) return 'approved'
  if (states.includes('COMMENTED')) return 'commented'
  return null
}

// Which board column a PR belongs in. Stateless: re-deriving from the latest reviews naturally moves a
// card back to In Review when a fresh non-approval review lands, and keeps it in Ready while approved.
export const classifyColumn = (pr: {
  state: PrState
  isDraft: boolean
  humanReview: ReviewFlavor
  botReview: ReviewFlavor
}): PrColumn => {
  if (pr.state === 'merged') return 'done'
  if (pr.isDraft) return 'waiting'
  // a human approval (with no outstanding change request) means "ready — I decide whether to merge"
  if (pr.humanReview === 'approved') return 'ready'
  // any submitted review (human non-approval, or a bot) puts it in review
  if (pr.humanReview !== null || pr.botReview !== null) return 'in_review'
  return 'waiting'
}

// Map a raw gh PR into a classified MyPr. Returns null for closed-unmerged PRs (not boarded).
export const toMyPr = (raw: GhMyPr, repo: string, repoPath: string | null): MyPr | null => {
  const state = raw.state.toLowerCase() as PrState
  if (state === 'closed') return null // closed without merging: don't board it

  const humanReviews = raw.latestReviews.filter((r) => !isBot(r.author))
  const botReviews = raw.latestReviews.filter((r) => isBot(r.author))
  const humanReview = reviewFlavor(humanReviews)
  const botReview = reviewFlavor(botReviews)

  return {
    id: `${repo}#${raw.number}`,
    repo,
    repoPath,
    number: raw.number,
    title: raw.title,
    url: raw.url,
    branch: raw.headRefName,
    createdAt: raw.createdAt,
    state,
    isDraft: raw.isDraft,
    column: classifyColumn({ state, isDraft: raw.isDraft, humanReview, botReview }),
    humanReview,
    botReview,
    ciState: rollupToCiState(raw.statusCheckRollup ?? []),
  }
}
