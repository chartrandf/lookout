import { describe, expect, it } from 'vitest'
import { menuNav, typeAhead } from './menunav'

describe('menuNav', () => {
  it('moves down and up, wrapping at the ends', () => {
    expect(menuNav(0, 'ArrowDown', 3)).toBe(1)
    expect(menuNav(2, 'ArrowDown', 3)).toBe(0)
    expect(menuNav(0, 'ArrowUp', 3)).toBe(2)
  })

  it('jumps to the first and last item', () => {
    expect(menuNav(1, 'Home', 3)).toBe(0)
    expect(menuNav(1, 'End', 3)).toBe(2)
  })

  it('starts from the top when nothing has focus', () => {
    expect(menuNav(-1, 'ArrowDown', 3)).toBe(0)
    expect(menuNav(-1, 'ArrowUp', 3)).toBe(2)
  })

  it('ignores other keys', () => {
    expect(menuNav(1, 'a', 3)).toBeNull()
  })
})

describe('typeAhead', () => {
  const labels = ['Discovery', 'Watching', 'Needs Review', 'Done', 'Ignored']

  it('finds the first label starting with what was typed, any case', () => {
    expect(typeAhead(labels, 'do', 0)).toBe(3)
    expect(typeAhead(labels, 'NE', 0)).toBe(2)
  })

  it('keeps the current option while it still matches', () => {
    expect(typeAhead(labels, 'd', 3)).toBe(3)
  })

  it('cycles through options sharing a letter when it is typed again', () => {
    expect(typeAhead(labels, 'dd', 0)).toBe(3)
    expect(typeAhead(labels, 'ddd', 3)).toBe(0)
  })

  it('stays put on no match', () => {
    expect(typeAhead(labels, 'zz', 2)).toBe(-1)
  })
})
