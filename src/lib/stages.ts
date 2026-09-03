import type { Stage } from '../types'

// The label the UI shows for each stage, in the order menus list them. Single source of truth: the
// board columns, the card's stage picker, global search and the Settings action editor all read from
// here — nothing renders a raw stage id. A Record, so a new Stage can't be forgotten.
export const STAGE_LABEL: Record<Stage, string> = {
  discovered: 'Discovery',
  watching: 'Watching',
  inbox: 'Needs Review',
  reviewing: 'In Review',
  reviewed: 'Reviewed',
  followup: 'Follow-up',
  done: 'Done',
  ignored: 'Ignored',
}

// Same thing as a list, for the pickers that render every stage as an option.
export const STAGES = (Object.keys(STAGE_LABEL) as Stage[]).map((value) => ({ value, label: STAGE_LABEL[value] }))

// The stages that get a column on the review board — Discovery and Ignored live off it.
export const BOARD_STAGES: Stage[] = ['watching', 'inbox', 'reviewing', 'reviewed', 'followup', 'done']

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
