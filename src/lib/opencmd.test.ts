import { describe, expect, it } from 'vitest'
import { commandName, expandTemplate } from './opencmd'

describe('commandName', () => {
  it('strips the command/commands prefix and the extension', () => {
    expect(commandName('commands/review.md')).toBe('review')
    expect(commandName('command/review.md')).toBe('review')
  })

  it('keeps nested dirs in the name', () => {
    expect(commandName('commands/team/review.md')).toBe('team/review')
  })
})

describe('expandTemplate', () => {
  it('replaces $ARGUMENTS with the whole input', () => {
    expect(expandTemplate('Review $ARGUMENTS for bugs.', '12')).toBe('Review 12 for bugs.')
  })

  it('fills positional placeholders, the last one taking the rest', () => {
    expect(expandTemplate('$1 then $2', 'a b c')).toBe('a then b c')
    expect(expandTemplate('$2 of $1', '"first arg" second')).toBe('second of first arg')
  })

  it('gives an unfilled placeholder nothing', () => {
    expect(expandTemplate('$1 and $2', 'only')).toBe('only and')
  })

  it('appends the input when the template has no placeholder', () => {
    expect(expandTemplate('Review the diff.', '12')).toBe('Review the diff.\n\n12')
  })

  it('leaves a no-placeholder template alone on an empty input', () => {
    expect(expandTemplate('Review the diff.', '  ')).toBe('Review the diff.')
  })

  it('trims the expanded text around the template', () => {
    expect(expandTemplate('  Review $ARGUMENTS  ', '12')).toBe('Review 12')
  })
})
