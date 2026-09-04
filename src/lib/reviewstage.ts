import type { Stage } from '../types'
import type { GhReview } from './gh'
import { isBot } from './prboard'

// What each Reviews column means, top to bottom of the pipeline:
//   Watching     — on the board, nothing done yet
//   Needs Review — a review session ran, but nothing was sent to the PR yet
//   Reviewed     — I sent at least one comment / review on the PR
//   Follow-up    — a follow-up run happened
//   Done         — I approved, or the PR merged
// The facts below are what the columns are read from, so a card can't sit in a column its facts
// don't support (Done excepted: a manual park there is terminal, see sync).
export type StageFacts = {
  hasSession: boolean // a claude session or a review report exists for this card
  spoke: boolean // I commented or reviewed on the PR
  approvedByMe: boolean // my latest review on the PR is an approval
  followupRan: boolean // a follow-up produced its summary
  merged: boolean
}

export const deriveStage = (current: Stage, f: StageFacts): Stage => {
  if (f.merged || f.approvedByMe) return 'done'
  if (f.followupRan) return 'followup'
  if (f.spoke) return 'reviewed'
  if (f.hasSession) return 'reviewing'
  // nothing done yet — 'needs_review' is a manual placement, so it isn't pulled back
  return current === 'needs_review' ? 'needs_review' : 'watching'
}

// My own latest verdict on the PR (bot reviews under my login can't happen, but keep it symmetric
// with the rest of the review handling).
export const approvedByMe = (reviews: GhReview[], me: string): boolean =>
  reviews
    .filter((r) => !isBot(r.author) && r.author?.login === me)
    .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt))
    .at(-1)
    ?.state.toUpperCase() === 'APPROVED'
