import { describe, expect, it } from 'vitest'
import { pickerEntries } from './repofiles'

describe('pickerEntries', () => {
  it('adds each directory once, with a trailing slash', () => {
    expect(pickerEntries('src/a.ts\nsrc/b.ts\n')).toEqual(['src/', 'src/a.ts', 'src/b.ts'])
  })

  it('lists the shallowest entries first, so a bare @ shows the top level', () => {
    expect(pickerEntries('src/lib/x.ts\nREADME.md\nsrc/y.ts')).toEqual([
      'README.md',
      'src/',
      'src/lib/',
      'src/y.ts',
      'src/lib/x.ts',
    ])
  })

  it('drops a path git lists twice', () => {
    expect(pickerEntries('a.ts\na.ts')).toEqual(['a.ts'])
  })
})
