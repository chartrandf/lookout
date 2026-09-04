import { describe, expect, it } from 'vitest'
import { flagNumber, flagString, parseArgs } from './args'

describe('parseArgs', () => {
  it('splits positionals from flags', () => {
    expect(parseArgs(['card', 'stage', 'reviewed', '--pr', '42'])).toEqual({
      path: ['card', 'stage', 'reviewed'],
      flags: { pr: '42' },
    })
  })

  it('accepts --flag=value', () => expect(parseArgs(['--repo=a/b']).flags).toEqual({ repo: 'a/b' }))

  it('treats a trailing flag as a boolean', () =>
    expect(parseArgs(['card', 'list', '--json']).flags).toEqual({ json: true }))

  it('keeps a boolean flag boolean when another flag follows', () =>
    expect(parseArgs(['--json', '--pr', '1']).flags).toEqual({ json: true, pr: '1' }))

  it('reads numbers and rejects junk', () => {
    expect(flagNumber({ count: '3' }, 'count')).toBe(3)
    expect(flagNumber({}, 'count')).toBeUndefined()
    expect(() => flagNumber({ count: 'three' }, 'count')).toThrow(/expects a number/)
  })

  it('ignores a boolean where a string is expected', () => expect(flagString({ repo: true }, 'repo')).toBeUndefined())
})
