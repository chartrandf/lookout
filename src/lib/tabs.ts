export type View = 'pulls' | 'board' | 'discovery' | 'stream' | 'automation' | 'settings'

// Single source of truth for tab order: shortcuts (⌘1..⌘n, Ctrl on Linux) derive from the index of the visible ones.
// The right-aligned side of the header (App) picks up stream + automation + settings; TAB_ORDER keeps them
// in visual order (stream just before automation) so the right side renders correctly.
export const TAB_ORDER: { view: View; label: string }[] = [
  { view: 'pulls', label: 'Pull Requests' },
  { view: 'board', label: 'Reviews' },
  { view: 'discovery', label: 'Discovery' },
  { view: 'stream', label: 'Stream' },
  { view: 'automation', label: 'Automation' },
  { view: 'settings', label: 'Settings' },
]

// Stream and its Automation tab are a beta behind a Settings flag: off, both tabs are gone and the
// shortcuts close up
export const visibleTabs = (streamEnabled: boolean) =>
  TAB_ORDER.filter((t) => streamEnabled || (t.view !== 'stream' && t.view !== 'automation'))

// the tab a modifier+<key> shortcut switches to among the visible ones, or null when the key has no tab
export const tabForKey = (key: string, tabs: typeof TAB_ORDER): View | null => {
  if (!/^[1-9]$/.test(key)) return null
  return tabs[Number(key) - 1]?.view ?? null
}
