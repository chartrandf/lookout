import { describe, expect, it } from 'vitest'
import { defaultAuto, type MergeOptions, mergeArgs, parseMergeOptions, pickMethod } from './merge'

// a repo allowing every strategy, where my GitHub default is squash — override per test
const opts = (o: Partial<MergeOptions> = {}): MergeOptions => ({
  allowed: ['merge', 'squash', 'rebase'],
  viewerDefault: 'squash',
  autoMerge: false,
  ...o,
})

describe('parseMergeOptions', () => {
  it('keeps only the strategies the repo allows, in GitHub order', () =>
    expect(
      parseMergeOptions({
        mergeCommitAllowed: false,
        squashMergeAllowed: true,
        rebaseMergeAllowed: true,
        viewerDefaultMergeMethod: 'REBASE',
      }),
    ).toEqual({ allowed: ['squash', 'rebase'], viewerDefault: 'rebase', autoMerge: false }))

  it('reads whether the repo allows auto-merge', () =>
    expect(
      parseMergeOptions({
        mergeCommitAllowed: true,
        squashMergeAllowed: false,
        rebaseMergeAllowed: false,
        autoMergeAllowed: true,
      }).autoMerge,
    ).toBe(true))

  it('drops an unknown viewer default', () =>
    expect(
      parseMergeOptions({ mergeCommitAllowed: true, squashMergeAllowed: false, rebaseMergeAllowed: false }),
    ).toEqual({ allowed: ['merge'], viewerDefault: null, autoMerge: false }))
})

describe('pickMethod — preference, else GitHub default, else first allowed', () => {
  it('uses the preferred strategy when the repo allows it', () => expect(pickMethod(opts({}), 'merge')).toBe('merge'))
  it('falls back to my GitHub default when the preference is off in this repo', () =>
    expect(pickMethod(opts({ allowed: ['squash', 'rebase'] }), 'merge')).toBe('squash'))
  it('"github" follows my GitHub default', () => expect(pickMethod(opts({}), 'github')).toBe('squash'))
  it('falls back to the first allowed when the GitHub default is off too', () =>
    expect(pickMethod(opts({ allowed: ['rebase'], viewerDefault: 'squash' }), 'merge')).toBe('rebase'))
  it('is null when the repo allows nothing', () => expect(pickMethod(opts({ allowed: [] }), 'merge')).toBe(null))
})

describe('mergeArgs', () => {
  it('builds the gh call for a strategy', () =>
    expect(mergeArgs('owner/repo', 7, 'squash')).toEqual(['pr', 'merge', '7', '--repo', 'owner/repo', '--squash']))
  it('asks GitHub to merge once requirements pass', () =>
    expect(mergeArgs('owner/repo', 7, 'merge', true)).toEqual([
      'pr',
      'merge',
      '7',
      '--repo',
      'owner/repo',
      '--merge',
      '--auto',
    ]))
})

describe('defaultAuto — auto-merge leads while CI still runs', () => {
  it('leads when CI is pending and the repo allows it', () =>
    expect(defaultAuto(opts({ autoMerge: true }), 'pending')).toBe(true))
  it('stays in the menu when CI is green', () => expect(defaultAuto(opts({ autoMerge: true }), 'pass')).toBe(false))
  it('never leads in a repo without auto-merge', () => expect(defaultAuto(opts(), 'pending')).toBe(false))
})
