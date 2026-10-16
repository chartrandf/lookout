// CHANGELOG.md (written by scripts/release.mjs) as releases, so each line's tag can show as a badge
export type ChangeTag = 'NEW' | 'ENHANCED' | 'FIX'
export type Release = { title: string; items: { tag: ChangeTag | null; text: string }[] }

const ITEM = /^- (?:\[(NEW|ENHANCED|FIX)\] )?(.+)$/

export const parseChangelog = (file: string): Release[] =>
  file.split('\n').reduce<Release[]>((releases, line) => {
    const m = line.match(ITEM)
    const last = releases.at(-1)
    if (line.startsWith('## ')) releases.push({ title: line.slice(3).trim(), items: [] })
    else if (m && last) last.items.push({ tag: (m[1] as ChangeTag) ?? null, text: m[2] })
    return releases
  }, [])
