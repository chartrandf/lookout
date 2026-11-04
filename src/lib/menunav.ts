// Arrow keys in an open menu: the index to focus next, wrapping at the ends. -1 = nothing focused
// yet. null = not a navigation key, let it through.
export const menuNav = (current: number, key: string, count: number): number | null => {
  if (key === 'ArrowDown') return (current + 1) % count
  if (key === 'ArrowUp') return current < 0 ? count - 1 : (current - 1 + count) % count
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  return null
}

// Typing in an open menu, like a native <select>: the first label starting with the typed text, from
// the current option on. The same letter again ("dd") steps to the next option starting with it.
// -1 = no match, stay put.
export const typeAhead = (labels: string[], typed: string, current: number): number => {
  const q = typed.toLowerCase()
  const repeat = q.length > 1 && [...q].every((c) => c === q[0])
  const prefix = repeat ? q[0] : q
  const start = repeat ? current + 1 : Math.max(0, current)
  for (let i = 0; i < labels.length; i++) {
    const at = (start + i) % labels.length
    if (labels[at].toLowerCase().startsWith(prefix)) return at
  }
  return -1
}
