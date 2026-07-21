import { describe, expect, it } from 'vitest'
import { emptyFilter, filterActive, matchesFilter } from './filters'

describe('matchesFilter', () => {
  it('matches everything when no filter is set', () => {
    expect(matchesFilter(emptyFilter, 'owner/repo', 'pass')).toBe(true)
    expect(matchesFilter(emptyFilter, 'owner/repo', null)).toBe(true)
  })

  it('filters by repo', () => {
    const f = { repos: ['a/b'], ci: [] }
    expect(matchesFilter(f, 'a/b', 'pass')).toBe(true)
    expect(matchesFilter(f, 'c/d', 'pass')).toBe(false)
  })

  it('filters by CI bucket, mapping null to "none"', () => {
    expect(matchesFilter({ repos: [], ci: ['fail'] }, 'a/b', 'fail')).toBe(true)
    expect(matchesFilter({ repos: [], ci: ['fail'] }, 'a/b', 'pass')).toBe(false)
    expect(matchesFilter({ repos: [], ci: ['none'] }, 'a/b', null)).toBe(true)
    expect(matchesFilter({ repos: [], ci: ['none'] }, 'a/b', 'pass')).toBe(false)
  })

  it('ANDs repo and CI', () => {
    const f = { repos: ['a/b'], ci: ['pass'] }
    expect(matchesFilter(f, 'a/b', 'pass')).toBe(true)
    expect(matchesFilter(f, 'a/b', 'fail')).toBe(false)
    expect(matchesFilter(f, 'c/d', 'pass')).toBe(false)
  })
})

describe('filterActive', () => {
  it('is false only for the empty filter', () => {
    expect(filterActive(emptyFilter)).toBe(false)
    expect(filterActive({ repos: ['a/b'], ci: [] })).toBe(true)
    expect(filterActive({ repos: [], ci: ['pass'] })).toBe(true)
  })
})
