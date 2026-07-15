import { describe, expect, it } from 'vitest'
import { fillPrompt } from './prompt'

describe('fillPrompt', () => {
  it('substitutes pr_id and branch_name placeholders', () => {
    expect(fillPrompt('/handle-review <pr_id>', 'my-branch', 42)).toBe('/handle-review 42')
    expect(fillPrompt('review <branch_name> #<pr_id>', 'feat-x', 7)).toBe('review feat-x #7')
  })

  it('replaces every occurrence of a placeholder', () => {
    expect(fillPrompt('<pr_id> then <pr_id>', 'b', 3)).toBe('3 then 3')
  })

  it('leaves a template without placeholders untouched', () => {
    expect(fillPrompt('/handle-review', 'b', 1)).toBe('/handle-review')
  })
})
