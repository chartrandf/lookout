const STEP = 0.15 // of the viewport
const MIN_PX = 400
const MAX_RATIO = 0.9

// Cmd+←/→ resize step: ±15% of the viewport, clamped to [400px, 90% of the viewport]
export const stepPanelWidth = (width: number, dir: 1 | -1, viewport: number) =>
  Math.min(Math.max(width + dir * viewport * STEP, MIN_PX), viewport * MAX_RATIO)

// true when typing there, so shortcuts should leave the key alone (e.g. Cmd+← moves the caret). An empty
// field has no caret to move, so the shortcut still works from the autofocused chat input.
export const isTextField = (el: Element | null) => {
  if (!el) return false
  if (el.tagName === 'SELECT') return true
  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return (el as HTMLInputElement).value !== ''
  return (el as HTMLElement).isContentEditable && !!el.textContent
}
