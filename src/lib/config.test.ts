import { describe, expect, it } from 'vitest'
import type { ActionButton } from '../types'
import { migrateButtons } from './config'

// Migration 012 renamed the `inbox` stage to `needs_review` in the database. Buttons live in the
// config store, which no SQL migration can reach — an un-migrated button would quietly stop
// matching the column it was configured for.
const button = (over: Partial<ActionButton> = {}): ActionButton => ({
  id: 'do-review',
  label: 'Do Review',
  prompt: '/do-review <branch_name>',
  conditions: [],
  ...over,
})

describe('migrateButtons', () => {
  it('rewrites a retired stage id in a condition', () => {
    const [b] = migrateButtons([
      button({ conditions: [{ field: 'stage', values: ['watching', 'inbox', 'reviewing'] }] }),
    ])
    expect(b.conditions[0].values).toEqual(['watching', 'needs_review', 'reviewing'])
  })

  it('rewrites a retired stage id in advanceTo', () => {
    const [b] = migrateButtons([button({ advanceTo: 'inbox' as ActionButton['advanceTo'] })])
    expect(b.advanceTo).toBe('needs_review')
  })

  it('leaves current ids alone', () => {
    const conditions: ActionButton['conditions'] = [{ field: 'stage', values: ['needs_review', 'done'] }]
    const [b] = migrateButtons([button({ conditions, advanceTo: 'reviewing' })])
    expect(b.conditions[0].values).toEqual(['needs_review', 'done'])
    expect(b.advanceTo).toBe('reviewing')
  })

  it('does not touch conditions on other fields', () => {
    // 'inbox' is not a stage here, so it must survive verbatim
    const conditions: ActionButton['conditions'] = [{ field: 'ciState', values: ['inbox'] }]
    const [b] = migrateButtons([button({ conditions })])
    expect(b.conditions[0].values).toEqual(['inbox'])
  })

  it('is a no-op for a button with no conditions', () => expect(migrateButtons([button()])[0]).toEqual(button()))
})
