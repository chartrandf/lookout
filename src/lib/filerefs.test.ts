import { describe, expect, it } from 'vitest'
import { droppedImageName, droppedPaths, expiredImages, fileRefs } from './filerefs'

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

describe('droppedImageName', () => {
  it('names a dropped image after the drop time, with its own extension', () => {
    expect(droppedImageName('image/png', 1700000000000, 0)).toBe('chat-images/1700000000000-0.png')
    expect(droppedImageName('image/jpeg', 1700000000000, 1)).toBe('chat-images/1700000000000-1.jpg')
  })

  it('keeps an odd subtype to plain file-name characters', () => {
    expect(droppedImageName('image/svg+xml', 1, 0)).toBe('chat-images/1-0.svg')
  })
})

describe('expiredImages', () => {
  const day = 86400_000
  const now = 100 * day

  it('picks the images saved more than 14 days ago, read off their names', () => {
    const names = [`${now - 15 * day}-0.png`, `${now - 13 * day}-0.jpg`, `${now}-1.png`]
    expect(expiredImages(names, now)).toEqual([`${now - 15 * day}-0.png`])
  })

  it('leaves alone a file it did not name', () => {
    expect(expiredImages(['notes.txt', '.DS_Store'], now)).toEqual([])
  })
})
