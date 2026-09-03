import type { ActionButton, ButtonBoard, ButtonConditionField, ReviewTask } from '../types'
import { PR_COLUMNS } from './prboard'
import { STAGES } from './stages'

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

// Condition fields offered in Settings per board, with the values each can match. Values carry the
// label the UI shows so the editor never renders a raw id.
type ConditionValue = { value: string; label: string }
type FieldOption = { field: ButtonConditionField; label: string; values: ConditionValue[] }

const CI_VALUES: ConditionValue[] = [
  { value: 'pass', label: 'Passing' },
  { value: 'fail', label: 'Failing' },
  { value: 'pending', label: 'Pending' },
  { value: 'none', label: 'No CI' },
]
const PR_STATE_VALUES: ConditionValue[] = [
  { value: 'open', label: 'Open' },
  { value: 'merged', label: 'Merged' },
  { value: 'closed', label: 'Closed' },
]
const SESSION_VALUES: ConditionValue[] = [
  { value: 'true', label: 'Yes' },
  { value: 'false', label: 'No' },
]

export const CONDITION_FIELDS: Record<ButtonBoard, FieldOption[]> = {
  review: [
    { field: 'stage', label: 'Card stage', values: STAGES },
    { field: 'ciState', label: 'CI state', values: CI_VALUES },
    { field: 'prState', label: 'PR state', values: PR_STATE_VALUES },
    { field: 'hasSession', label: 'Has session', values: SESSION_VALUES },
  ],
  pr: [
    { field: 'column', label: 'Board column', values: PR_COLUMNS },
    { field: 'ciState', label: 'CI state', values: CI_VALUES },
    { field: 'prState', label: 'PR state', values: PR_STATE_VALUES },
    { field: 'hasSession', label: 'Has session', values: SESSION_VALUES },
  ],
}
