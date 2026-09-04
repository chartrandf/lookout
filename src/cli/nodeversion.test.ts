import { describe, expect, it } from 'vitest'
import { isSupportedNode } from './nodeversion'

// Checked against the real binaries: node:sqlite throws "No such built-in module" on 22.5, 22.11
// and 22.12, and works on 22.13.
describe('isSupportedNode', () => {
  it('accepts the versions where node:sqlite is unflagged', () => {
    expect(isSupportedNode('v22.13.0')).toBe(true)
    expect(isSupportedNode('22.23.1')).toBe(true)
    expect(isSupportedNode('v23.4.0')).toBe(true)
    expect(isSupportedNode('v24.13.1')).toBe(true)
  })

  it('rejects the versions where it needs --experimental-sqlite, which a bare `lookout` cannot pass', () => {
    expect(isSupportedNode('v22.5.1')).toBe(false)
    expect(isSupportedNode('v22.12.0')).toBe(false)
    expect(isSupportedNode('v23.3.0')).toBe(false)
  })

  it('rejects versions with no node:sqlite at all', () => {
    expect(isSupportedNode('v20.18.2')).toBe(false)
    expect(isSupportedNode('v18.15.0')).toBe(false)
  })

  it('rejects anything it cannot parse', () => expect(isSupportedNode('banana')).toBe(false))
})
