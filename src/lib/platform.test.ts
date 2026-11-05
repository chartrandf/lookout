import { describe, expect, it } from 'vitest'
import { chord, chordLabel, modLabel, platformOf, shortcutMod } from './platform'

// the fields the helpers read; the rest of KeyboardEvent doesn't matter here
const key = (k: string, mods: { meta?: boolean; ctrl?: boolean; shift?: boolean; alt?: boolean } = {}) =>
  ({
    key: k,
    metaKey: !!mods.meta,
    ctrlKey: !!mods.ctrl,
    shiftKey: !!mods.shift,
    altKey: !!mods.alt,
  }) as KeyboardEvent

const MAC_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)'
const LINUX_UA = 'Mozilla/5.0 (X11; Linux x86_64)'
const WINDOWS_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'

describe('platformOf', () => {
  it('reads macOS and Linux apart', () => {
    expect(platformOf(MAC_UA)).toBe('mac')
    expect(platformOf(LINUX_UA)).toBe('linux')
  })

  it('has no platform for the rest of the world', () => {
    expect(platformOf(WINDOWS_UA)).toBe('other')
  })
})

describe('shortcutMod', () => {
  it('is ⌘ on macOS and Ctrl on Linux, never the other', () => {
    expect(shortcutMod(key('f', { meta: true }), 'mac')).toBe(true)
    expect(shortcutMod(key('f', { ctrl: true }), 'mac')).toBe(false)
    expect(shortcutMod(key('f', { ctrl: true }), 'linux')).toBe(true)
    expect(shortcutMod(key('f', { meta: true }), 'linux')).toBe(false)
  })

  it('has nothing to hold anywhere else', () => {
    expect(shortcutMod(key('f', { meta: true }), 'other')).toBe(false)
    expect(shortcutMod(key('f', { ctrl: true }), 'other')).toBe(false)
  })
})

describe('chord', () => {
  it('matches the key with the platform modifier', () => {
    expect(chord(key('f', { meta: true }), 'f', {}, 'mac')).toBe(true)
    expect(chord(key('f', { ctrl: true }), 'f', {}, 'linux')).toBe(true)
    expect(chord(key('F', { ctrl: true }), 'f', {}, 'linux')).toBe(true)
  })

  it('is a no-op on an unknown platform', () => {
    expect(chord(key('f', { meta: true }), 'f', {}, 'other')).toBe(false)
    expect(chord(key('f', { ctrl: true }), 'f', {}, 'other')).toBe(false)
  })

  it('requires Shift and Alt up unless asked', () => {
    expect(chord(key('f', { meta: true, shift: true }), 'f', {}, 'mac')).toBe(false)
    expect(chord(key('f', { meta: true, shift: true }), 'f', { shift: true }, 'mac')).toBe(true)
    expect(chord(key('f', { meta: true, alt: true }), 'f', {}, 'mac')).toBe(false)
    expect(chord(key('f', { meta: true, alt: true }), 'f', { alt: true }, 'mac')).toBe(true)
  })

  it('ignores a bare key and another modifier', () => {
    expect(chord(key('f', { meta: true }), 'g', {}, 'mac')).toBe(false)
    expect(chord(key('f'), 'f', {}, 'mac')).toBe(false)
  })
})

describe('chordLabel', () => {
  it('writes the platform modifier into hints', () => {
    expect(chordLabel('F', 'mac')).toBe('⌘F')
    expect(chordLabel('F', 'linux')).toBe('Ctrl+F')
    expect(modLabel('linux')).toBe('Ctrl')
  })

  it('shows no hint where there is no chord', () => {
    expect(chordLabel('F', 'other')).toBe('')
  })
})
