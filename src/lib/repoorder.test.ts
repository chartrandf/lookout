import { describe, expect, it } from 'vitest'
import { moveRepoBefore, sortReposByNames } from './repoorder'

const names = ['a/one', 'b/two', 'c/three']

describe('moveRepoBefore', () => {
  it('moves a repo before another', () => {
    expect(moveRepoBefore(names, 'c/three', 'a/one')).toEqual(['c/three', 'a/one', 'b/two'])
  })

  it('moves a repo to the end when before is null', () => {
    expect(moveRepoBefore(names, 'a/one', null)).toEqual(['b/two', 'c/three', 'a/one'])
  })

  it('is a no-op when dropped on itself', () => {
    expect(moveRepoBefore(names, 'b/two', 'b/two')).toEqual(names)
  })

  it('appends when the target is unknown', () => {
    expect(moveRepoBefore(names, 'a/one', 'x/gone')).toEqual(['b/two', 'c/three', 'a/one'])
  })
})

describe('sortReposByNames', () => {
  const repos = [
    { repo: 'a/one', path: '/a' },
    { repo: 'b/two', path: '/b' },
    { repo: 'c/three', path: '/c' },
  ]

  it('follows the given order', () => {
    expect(sortReposByNames(repos, ['c/three', 'b/two', 'a/one']).map((r) => r.repo)).toEqual([
      'c/three',
      'b/two',
      'a/one',
    ])
  })

  it('keeps repos missing from the order at the end, in place', () => {
    expect(sortReposByNames(repos, ['c/three']).map((r) => r.repo)).toEqual(['c/three', 'a/one', 'b/two'])
  })

  it('keeps two clones of the same repo together', () => {
    const dup = [...repos, { repo: 'a/one', path: '/a2' }]
    expect(sortReposByNames(dup, ['b/two', 'a/one']).map((r) => r.path)).toEqual(['/b', '/a', '/a2', '/c'])
  })
})
