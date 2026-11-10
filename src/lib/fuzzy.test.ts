import { describe, expect, it } from 'vitest'
import { fuzzyFilter, fuzzyScore } from './fuzzy'

describe('fuzzyScore', () => {
  it('matches the query letters in order, skipping the ones between', () => {
    expect(fuzzyScore('cmdta', 'src/components/CommandTextarea.tsx')).not.toBeNull()
  })

  it('rejects a query whose letters are out of order', () => {
    expect(fuzzyScore('atc', 'cat.ts')).toBeNull()
  })

  it('ignores case', () => {
    expect(fuzzyScore('README', 'docs/readme.md')).not.toBeNull()
  })
})

describe('fuzzyFilter', () => {
  const files = [
    'src/lib/session-store.ts',
    'src/components/SessionPanel.tsx',
    'docs/panels/session.md',
    'src/lib/fuzzy.ts',
  ]

  it('drops what does not match', () => {
    expect(fuzzyFilter('fzy', files)).toEqual(['src/lib/fuzzy.ts'])
  })

  it('ranks a hit in the file name above one spread over the directories', () => {
    expect(fuzzyFilter('sp', ['src/lib/panel.ts', 'src/components/SessionPanel.tsx'])[0]).toBe(
      'src/components/SessionPanel.tsx',
    )
  })

  it('ranks consecutive letters above scattered ones', () => {
    expect(fuzzyFilter('panel', files)[0]).toBe('src/components/SessionPanel.tsx')
  })

  it('keeps the original order for an empty query', () => {
    expect(fuzzyFilter('', files)).toEqual(files)
  })

  it('stops at the limit', () => {
    expect(fuzzyFilter('s', files, 2)).toHaveLength(2)
  })
})
