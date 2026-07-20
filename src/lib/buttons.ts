import type { ActionButton, ButtonBoard, ButtonConditionField, ReviewTask } from '../types'

// The task value a condition field resolves to (always a string, so it matches condition.values).
const fieldValue = (t: ReviewTask, field: ButtonConditionField): string => {
  switch (field) {
    case 'stage':
      return t.stage
    case 'column':
      return t.column ?? ''
    case 'ciState':
      return t.ciState ?? 'none'
    case 'prState':
      return t.prState
    case 'hasSession':
      return t.sessionIds.length > 0 ? 'true' : 'false'
  }
}

// A button shows when every condition matches (empty conditions = always).
export const buttonVisible = (button: ActionButton, task: ReviewTask): boolean =>
  button.conditions.every((c) => c.values.includes(fieldValue(task, c.field)))

export const visibleButtons = (buttons: ActionButton[], task: ReviewTask): ActionButton[] =>
  buttons.filter((b) => buttonVisible(b, task))

// Condition fields offered in Settings per board, with the values each can match.
type FieldOption = { field: ButtonConditionField; label: string; values: string[] }

const CI_VALUES = ['pass', 'fail', 'pending', 'none']
const PR_STATE_VALUES = ['open', 'merged', 'closed']
const SESSION_VALUES = ['true', 'false']

export const CONDITION_FIELDS: Record<ButtonBoard, FieldOption[]> = {
  review: [
    {
      field: 'stage',
      label: 'Card stage',
      values: ['discovered', 'watching', 'inbox', 'reviewing', 'reviewed', 'followup', 'done', 'ignored'],
    },
    { field: 'ciState', label: 'CI state', values: CI_VALUES },
    { field: 'prState', label: 'PR state', values: PR_STATE_VALUES },
    { field: 'hasSession', label: 'Has session', values: SESSION_VALUES },
  ],
  pr: [
    { field: 'column', label: 'Board column', values: ['waiting', 'in_review', 'ready', 'done'] },
    { field: 'ciState', label: 'CI state', values: CI_VALUES },
    { field: 'prState', label: 'PR state', values: PR_STATE_VALUES },
    { field: 'hasSession', label: 'Has session', values: SESSION_VALUES },
  ],
}
