import { describe, expect, it } from 'vitest'
import { droppedPaths, fileRefs } from './filerefs'

describe('droppedPaths', () => {
  it('reads file URLs out of a uri-list, decoded', () => {
    expect(droppedPaths('file:///Users/me/a%20b.md\r\nfile:///tmp/x.ts', '')).toEqual(['/Users/me/a b.md', '/tmp/x.ts'])
  })

  it('skips uri-list comments and links that are not files', () => {
    expect(droppedPaths('# comment\r\nhttps://example.com\r\nfile:///tmp/x.ts', '')).toEqual(['/tmp/x.ts'])
  })

  it('falls back to absolute paths in the plain text', () => {
    expect(droppedPaths('', '/tmp/x.ts\n/tmp/y.ts')).toEqual(['/tmp/x.ts', '/tmp/y.ts'])
  })

  it('finds nothing in dragged prose', () => {
    expect(droppedPaths('', 'some selected text')).toEqual([])
  })
})

describe('fileRefs', () => {
  it('prefixes each path with @, spaced from the text before', () => {
    expect(fileRefs(['/tmp/x.ts', '/tmp/y.ts'], 'look at')).toBe(' @/tmp/x.ts @/tmp/y.ts ')
  })

  it('adds no leading space at the start or after whitespace', () => {
    expect(fileRefs(['/tmp/x.ts'], '')).toBe('@/tmp/x.ts ')
    expect(fileRefs(['/tmp/x.ts'], 'look at ')).toBe('@/tmp/x.ts ')
  })
})
