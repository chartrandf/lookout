// fzf-style matching for the `@` file picker: the query's letters appear in order in the path,
// anything may sit between them. Runs of letters, word starts and hits in the file name score higher.

const SEPARATOR = /[/\\\-_.\s]/

// one match of `q` in `t` with its first letter pinned at `start`, the rest taken as early as possible
const scoreFrom = (q: string, t: string, text: string, start: number): number | null => {
  const base = t.lastIndexOf('/') + 1
  let score = 0
  let prev = -1
  for (let k = 0; k < q.length; k++) {
    const i = k === 0 ? start : t.indexOf(q[k], prev + 1)
    if (i === -1) return null
    score += 1
    if (k > 0) score += i === prev + 1 ? 5 : -Math.min(i - prev - 1, 10) * 0.2 // run, or gap
    const camel = i > 0 && /[A-Z]/.test(text[i]) && /[a-z]/.test(text[i - 1])
    if (i === 0 || SEPARATOR.test(t[i - 1]) || camel) score += 4 // word start
    if (i >= base) score += 2 // in the file name
    prev = i
  }
  return score
}

// how well `query` matches `text`, higher is better; null when it doesn't
export const fuzzyScore = (query: string, text: string): number | null => {
  const q = query.toLowerCase()
  const t = text.toLowerCase()
  if (q === '') return 0
  let best: number | null = null
  for (let s = t.indexOf(q[0]); s !== -1; s = t.indexOf(q[0], s + 1)) {
    const score = scoreFrom(q, t, text, s)
    if (score === null) break // no later start can fit the rest either
    if (best === null || score > best) best = score
  }
  return best
}

// the best `limit` matches, best first; a tie goes to the shorter path, then the original order
export const fuzzyFilter = (query: string, items: string[], limit = Number.POSITIVE_INFINITY): string[] => {
  if (query === '') return items.slice(0, limit)
  return items
    .map((item, i) => ({ item, i, score: fuzzyScore(query, item) }))
    .filter((m): m is { item: string; i: number; score: number } => m.score !== null)
    .sort((a, b) => b.score - a.score || a.item.length - b.item.length || a.i - b.i)
    .slice(0, limit)
    .map((m) => m.item)
}
