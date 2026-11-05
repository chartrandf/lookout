// Shortcut keys follow the platform: ⌘ on macOS, Ctrl on Linux. Lookout ships those two, so on any
// other platform no chord matches — a shortcut never fires somewhere it was never tested. Every key
// handler goes through `chord` and every hint through `chordLabel`, so the two can't drift apart.

export type Platform = 'mac' | 'linux' | 'other'

// What a chord reads off an event: both the DOM's KeyboardEvent and React's synthetic one fit
export type KeyChord = Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'>

export const platformOf = (ua: string): Platform =>
  /Mac|iPhone|iPad/.test(ua) ? 'mac' : /Linux/.test(ua) ? 'linux' : 'other'

export const platform = (): Platform => (typeof navigator === 'undefined' ? 'other' : platformOf(navigator.userAgent))

// True when the event holds this platform's shortcut modifier — and not the other one, so ⌘ on
// Linux or Ctrl on macOS is never a shortcut.
export const shortcutMod = (e: { metaKey: boolean; ctrlKey: boolean }, p: Platform = platform()): boolean =>
  p === 'mac' ? e.metaKey && !e.ctrlKey : p === 'linux' ? e.ctrlKey && !e.metaKey : false

// The modifier as hints write it, empty where the platform has no chord.
export const modLabel = (p: Platform = platform()): string => (p === 'mac' ? '⌘' : p === 'linux' ? 'Ctrl' : '')

// A plain chord press: chord(e, 'f'), chord(e, 'ArrowLeft'), chord(e, 'Enter', { shift: true }).
// Shift and Alt must be up unless asked for.
export const chord = (
  e: KeyChord,
  key: string,
  opts: { shift?: boolean; alt?: boolean } = {},
  p: Platform = platform(),
): boolean =>
  shortcutMod(e, p) &&
  e.key.toLowerCase() === key.toLowerCase() &&
  e.shiftKey === !!opts.shift &&
  e.altKey === !!opts.alt

// "⌘F" / "Ctrl+F" for a tooltip — empty where the platform has no chord, so a hint never lies.
export const chordLabel = (key: string, p: Platform = platform()): string => {
  const mod = modLabel(p)
  return mod ? (p === 'mac' ? `${mod}${key}` : `${mod}+${key}`) : ''
}
