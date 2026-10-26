// A PR's unified diff (`gh pr diff`), split per file. Lines are kept raw here and numbered only when a
// file is expanded (diffLines), so a big PR costs one string split until someone opens a file.

export type DiffFile = {
  path: string
  oldPath: string | null // set on a rename
  status: 'added' | 'deleted' | 'renamed' | 'modified'
  binary: boolean
  additions: number
  deletions: number
  body: string[] // from the first @@ on
}

export type DiffLine =
  | { kind: 'hunk'; text: string }
  | { kind: 'add' | 'del' | 'ctx'; text: string; old: number | null; new: number | null }

const unquote = (p: string) => p.replace(/^"|"$/g, '')

export const parseDiff = (text: string): DiffFile[] => {
  const files: DiffFile[] = []
  let f: DiffFile | null = null
  let inBody = false
  for (const line of text.split('\n')) {
    if (line.startsWith('diff --git ')) {
      // "diff --git a/x b/x": the b/ side is the path the file ends up at
      const m = /^diff --git "?a\/(.+?)"? "?b\/(.+?)"?$/.exec(line)
      f = {
        path: unquote(m?.[2] ?? line.slice(11)),
        oldPath: null,
        status: 'modified',
        binary: false,
        additions: 0,
        deletions: 0,
        body: [],
      }
      files.push(f)
      inBody = false
      continue
    }
    if (!f) continue
    if (inBody) {
      if (line.startsWith('+')) f.additions++
      else if (line.startsWith('-')) f.deletions++
      f.body.push(line)
    } else if (line.startsWith('@@')) {
      inBody = true
      f.body.push(line)
    } else if (line.startsWith('new file mode')) f.status = 'added'
    else if (line.startsWith('deleted file mode')) f.status = 'deleted'
    else if (line.startsWith('rename from ')) {
      f.status = 'renamed'
      f.oldPath = unquote(line.slice(12))
    } else if (line.startsWith('Binary files') || line === 'GIT binary patch') f.binary = true
  }
  // the diff ends with a newline: drop the empty line it leaves on the last file
  if (f?.body.at(-1) === '') f.body.pop()
  return files
}

// Numbered lines of one file, for the expanded view
export const diffLines = (body: string[]): DiffLine[] => {
  let oldN = 0
  let newN = 0
  const out: DiffLine[] = []
  for (const text of body) {
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)/.exec(text)
    if (hunk) {
      oldN = Number(hunk[1])
      newN = Number(hunk[2])
      out.push({ kind: 'hunk', text })
    } else if (text.startsWith('\\'))
      continue // "\ No newline at end of file"
    else if (text.startsWith('+')) out.push({ kind: 'add', text: text.slice(1), old: null, new: newN++ })
    else if (text.startsWith('-')) out.push({ kind: 'del', text: text.slice(1), old: oldN++, new: null })
    else out.push({ kind: 'ctx', text: text.slice(1), old: oldN++, new: newN++ })
  }
  return out
}

export type SplitCell = { kind: 'add' | 'del' | 'ctx'; text: string; n: number }
export type SplitRow =
  | { kind: 'hunk'; text: string }
  | { kind: 'pair'; left: SplitCell | null; right: SplitCell | null }

// Side-by-side rows: context on both sides; in a run of changes the i-th removed line sits next to
// the i-th added one (GitHub's pairing), and the longer side's leftovers face an empty cell.
export const splitRows = (lines: DiffLine[]): SplitRow[] => {
  const rows: SplitRow[] = []
  let dels: SplitCell[] = []
  let adds: SplitCell[] = []
  const flush = () => {
    for (let i = 0; i < Math.max(dels.length, adds.length); i++)
      rows.push({ kind: 'pair', left: dels[i] ?? null, right: adds[i] ?? null })
    dels = []
    adds = []
  }
  for (const l of lines) {
    if (l.kind === 'del') dels.push({ kind: 'del', text: l.text, n: l.old ?? 0 })
    else if (l.kind === 'add') adds.push({ kind: 'add', text: l.text, n: l.new ?? 0 })
    else {
      flush()
      if (l.kind === 'hunk') rows.push(l)
      else
        rows.push({
          kind: 'pair',
          left: { kind: 'ctx', text: l.text, n: l.old ?? 0 },
          right: { kind: 'ctx', text: l.text, n: l.new ?? 0 },
        })
    }
  }
  flush()
  return rows
}

// Past this many lines a file stays folded until clicked, like GitHub's "Load diff"
export const LARGE_FILE_LINES = 300
// …and past this many files, every file starts folded
export const MANY_FILES = 30

export const startsOpen = (f: DiffFile, fileCount: number) =>
  fileCount <= MANY_FILES && !f.binary && f.body.length <= LARGE_FILE_LINES
