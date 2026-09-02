import type { Stage } from '../types'

// How far along the review pipeline each stage sits. Off-board stages rank below the pipeline.
const RANK: Record<Stage, number> = {
  ignored: -1,
  discovered: 0,
  watching: 1,
  inbox: 2,
  reviewing: 3,
  reviewed: 4,
  followup: 5,
  done: 6,
}

// Automated stage moves are forward-only: a card that already reached follow-up stays there when a
// fresh review runs — having done a first round is a fact the button shouldn't undo.
export const advanceStage = (current: Stage, target: Stage): Stage => (RANK[target] > RANK[current] ? target : current)

// The stages where approving on GitHub makes sense: I've had my say (reviewed / follow-up), or the
// card is already parked in Done and I just want to stamp the approval.
const APPROVABLE: Stage[] = ['reviewed', 'followup', 'done']

export const canApproveFrom = (stage: Stage): boolean => APPROVABLE.includes(stage)
