import { describe, expect, it } from 'vitest'
import { diffLines, LARGE_FILE_LINES, MANY_FILES, parseDiff, splitRows, startsOpen } from './diff'

const DIFF = `diff --git a/src/app.ts b/src/app.ts
index 1111111..2222222 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,3 +1,4 @@
 const a = 1
-const b = 2
+const b = 3
+const c = 4
 export { a }
diff --git a/README.md b/README.md
new file mode 100644
index 0000000..3333333
--- /dev/null
+++ b/README.md
@@ -0,0 +1 @@
+# Hello
\\ No newline at end of file
diff --git a/old.ts b/new.ts
similarity index 100%
rename from old.ts
rename to new.ts
diff --git a/logo.png b/logo.png
deleted file mode 100644
index 4444444..0000000
Binary files a/logo.png and /dev/null differ
`

describe('parseDiff', () => {
  const files = parseDiff(DIFF)

  it('splits the diff per file, with the path it ends up at', () => {
    expect(files.map((f) => f.path)).toEqual(['src/app.ts', 'README.md', 'new.ts', 'logo.png'])
  })

  it('counts what each file adds and removes', () => {
    expect(files[0]).toEqual(expect.objectContaining({ status: 'modified', additions: 2, deletions: 1 }))
  })

  it('tells added, renamed and deleted files apart', () => {
    expect(files[1].status).toBe('added')
    expect(files[2]).toEqual(expect.objectContaining({ status: 'renamed', oldPath: 'old.ts', body: [] }))
    expect(files[3]).toEqual(expect.objectContaining({ status: 'deleted', binary: true }))
  })

  it('keeps the body from the first hunk on, without the trailing empty line', () => {
    expect(files[0].body[0]).toBe('@@ -1,3 +1,4 @@')
    expect(files[0].body.at(-1)).toBe(' export { a }')
  })

  it('reads nothing out of an empty diff', () => {
    expect(parseDiff('')).toEqual([])
  })
})

describe('diffLines', () => {
  it('numbers both sides from the hunk header', () => {
    const lines = diffLines(parseDiff(DIFF)[0].body)
    expect(lines).toEqual([
      { kind: 'hunk', text: '@@ -1,3 +1,4 @@' },
      { kind: 'ctx', text: 'const a = 1', old: 1, new: 1 },
      { kind: 'del', text: 'const b = 2', old: 2, new: null },
      { kind: 'add', text: 'const b = 3', old: null, new: 2 },
      { kind: 'add', text: 'const c = 4', old: null, new: 3 },
      { kind: 'ctx', text: 'export { a }', old: 3, new: 4 },
    ])
  })

  it('leaves out the no-newline marker', () => {
    expect(diffLines(parseDiff(DIFF)[1].body).map((l) => l.kind)).toEqual(['hunk', 'add'])
  })
})

describe('startsOpen', () => {
  const file = parseDiff(DIFF)[0]

  it('opens a small file of a small PR', () => {
    expect(startsOpen(file, 4)).toBe(true)
  })

  it('folds a large file until clicked', () => {
    expect(startsOpen({ ...file, body: Array(LARGE_FILE_LINES + 1).fill(' x') }, 4)).toBe(false)
  })

  it('folds everything in a PR with many files', () => {
    expect(startsOpen(file, MANY_FILES + 1)).toBe(false)
  })

  it('folds a binary file', () => {
    expect(startsOpen({ ...file, binary: true }, 4)).toBe(false)
  })
})

describe('splitRows', () => {
  const ctx = (text: string, o: number, n: number) => ({
    kind: 'pair',
    left: { kind: 'ctx', text, n: o },
    right: { kind: 'ctx', text, n },
  })

  it('pairs a removed line with the line that replaced it, and leaves the extra add facing nothing', () => {
    expect(splitRows(diffLines(parseDiff(DIFF)[0].body))).toEqual([
      { kind: 'hunk', text: '@@ -1,3 +1,4 @@' },
      ctx('const a = 1', 1, 1),
      {
        kind: 'pair',
        left: { kind: 'del', text: 'const b = 2', n: 2 },
        right: { kind: 'add', text: 'const b = 3', n: 2 },
      },
      { kind: 'pair', left: null, right: { kind: 'add', text: 'const c = 4', n: 3 } },
      ctx('export { a }', 3, 4),
    ])
  })

  it('leaves an empty right side on a pure removal', () => {
    const rows = splitRows(diffLines(['@@ -1,2 +1,0 @@', '-a', '-b']))
    expect(rows.slice(1)).toEqual([
      { kind: 'pair', left: { kind: 'del', text: 'a', n: 1 }, right: null },
      { kind: 'pair', left: { kind: 'del', text: 'b', n: 2 }, right: null },
    ])
  })
})
