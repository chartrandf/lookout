import { memo, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { type DiffLayout, getDiffLayout, setDiffLayout } from '../lib/config'
import { type DiffFile, diffLines, fileMatches, parseDiff, type SplitCell, splitRows, startsOpen } from '../lib/diff'
import { fetchPrDiff } from '../lib/gh'
import { errText } from '../lib/log'
import { chord, chordLabel } from '../lib/platform'
import { BackButton } from './BackButton'

// The find chord is per platform and lives only with this view: ⌘F on macOS, Ctrl+F on Linux.
const FIND_HINT = chordLabel('F')

// Lucide "diff": the panel header's button that opens this view
export const DiffIcon = () => (
  <svg
    width={14}
    height={14}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M12 3v14" />
    <path d="M5 10h14" />
    <path d="M5 21h14" />
  </svg>
)

const LINE_CLASS = {
  add: 'bg-grass-600/15 text-grass-200',
  del: 'bg-red-600/15 text-red-200',
  ctx: 'text-deck-300',
} as const

// The find bar's magnifier: lucide "search"
const SearchIcon = () => (
  <svg
    width={12}
    height={12}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </svg>
)

// Marks every occurrence of the find query in one run of text: a hit line stays readable whole
const Marked = ({ text, query }: { text: string; query: string }) => {
  const q = query.trim().toLowerCase()
  if (!q) return <>{text}</>
  const lower = text.toLowerCase()
  const parts: ReactNode[] = []
  let at = 0
  for (let i = lower.indexOf(q); i !== -1; i = lower.indexOf(q, i + q.length)) {
    if (i > at) parts.push(text.slice(at, i))
    parts.push(
      <mark key={i} className="rounded-sm bg-amber-400/40 text-amber-50">
        {text.slice(i, i + q.length)}
      </mark>,
    )
    at = i + q.length
  }
  if (!parts.length) return <>{text}</>
  parts.push(text.slice(at))
  return <>{parts}</>
}

const STATUS_LABEL: Record<DiffFile['status'], string | null> = {
  added: 'added',
  deleted: 'deleted',
  renamed: 'renamed',
  modified: null,
}

// One file's lines, numbered only once it's open: a folded file costs its header alone
const FileBody = memo(({ body, query }: { body: string[]; query: string }) => {
  const lines = useMemo(() => diffLines(body), [body])
  return (
    <div className="overflow-x-auto font-mono text-[11px] leading-[18px]">
      <div className="min-w-max">
        {lines.map((l, i) =>
          l.kind === 'hunk' ? (
            // biome-ignore lint/suspicious/noArrayIndexKey: a file's lines never reorder
            <div key={i} className="bg-sky-900/30 px-2 text-sky-300">
              <Marked text={l.text} query={query} />
            </div>
          ) : (
            // biome-ignore lint/suspicious/noArrayIndexKey: a file's lines never reorder
            <div key={i} className={`flex ${LINE_CLASS[l.kind]}`}>
              <span className="w-10 shrink-0 select-none pr-1 text-right text-deck-600">{l.old ?? ''}</span>
              <span className="w-10 shrink-0 select-none pr-1 text-right text-deck-600">{l.new ?? ''}</span>
              <span className="w-4 shrink-0 select-none text-center">
                {l.kind === 'add' ? '+' : l.kind === 'del' ? '-' : ' '}
              </span>
              <span className="whitespace-pre pr-4">
                <Marked text={l.text} query={query} />
              </span>
            </div>
          ),
        )}
      </div>
    </div>
  )
})

const Cell = ({ cell, query }: { cell: SplitCell | null; query: string }) => (
  <>
    <span className={`select-none pr-1 text-right text-deck-600 ${cell ? LINE_CLASS[cell.kind] : 'bg-deck-800/60'}`}>
      {cell?.n ?? ''}
    </span>
    {/* split halves wrap instead of scrolling: two scrollbars per file would drift apart */}
    <span className={`whitespace-pre-wrap break-all pr-2 ${cell ? LINE_CLASS[cell.kind] : 'bg-deck-800/60'}`}>
      {cell && (
        <>
          {cell.kind === 'add' ? '+' : cell.kind === 'del' ? '-' : ' '}
          <Marked text={cell.text} query={query} />
        </>
      )}
    </span>
  </>
)

// Side by side: removed lines left, their replacements right
const SplitBody = memo(({ body, query }: { body: string[]; query: string }) => {
  const rows = useMemo(() => splitRows(diffLines(body)), [body])
  return (
    <div className="grid grid-cols-[2.5rem_minmax(0,1fr)_2.5rem_minmax(0,1fr)] font-mono text-[11px] leading-[18px]">
      {rows.map((r, i) =>
        r.kind === 'hunk' ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: a file's rows never reorder
          <div key={i} className="col-span-4 bg-sky-900/30 px-2 text-sky-300">
            <Marked text={r.text} query={query} />
          </div>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: a file's rows never reorder
          <div key={i} className="contents">
            <Cell cell={r.left} query={query} />
            <Cell cell={r.right} query={query} />
          </div>
        ),
      )}
    </div>
  )
})

const FileBlock = ({
  file,
  open,
  layout,
  query,
  onToggle,
  anchor,
}: {
  file: DiffFile
  open: boolean
  layout: DiffLayout
  query: string
  onToggle: () => void
  anchor: (el: HTMLDivElement | null) => void
}) => {
  const status = STATUS_LABEL[file.status]
  return (
    // shrink-0: overflow-hidden drops a flex item's min height, so files squeezed to fit instead of scrolling
    <div ref={anchor} className="shrink-0 overflow-hidden rounded-md border border-deck-700">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full cursor-pointer items-center gap-2 bg-deck-800 px-3 py-1.5 text-left text-xs hover:bg-deck-700"
      >
        <span className="w-3 shrink-0 text-deck-500">{open ? '▾' : '▸'}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-deck-200">
          {file.oldPath ? (
            <>
              <Marked text={file.oldPath} query={query} /> → <Marked text={file.path} query={query} />
            </>
          ) : (
            <Marked text={file.path} query={query} />
          )}
        </span>
        {status && <span className="shrink-0 text-deck-500">{status}</span>}
        <span className="shrink-0 font-mono text-grass-300">+{file.additions}</span>
        <span className="shrink-0 font-mono text-red-300">-{file.deletions}</span>
      </button>
      {open &&
        (file.binary ? (
          <p className="px-3 py-2 text-xs text-deck-500">Binary file not shown</p>
        ) : file.body.length ? (
          layout === 'split' ? (
            <SplitBody body={file.body} query={query} />
          ) : (
            <FileBody body={file.body} query={query} />
          )
        ) : (
          <p className="px-3 py-2 text-xs text-deck-500">No content change</p>
        ))}
    </div>
  )
}

// The PR's file changes, over the panel. Fetched when opened, never by the sync or the panel itself.
export const DiffView = ({ repo, prNumber, onBack }: { repo: string; prNumber: number; onBack: () => void }) => {
  const [files, setFiles] = useState<DiffFile[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<Set<number>>(new Set())
  const [layout, setLayout] = useState<DiffLayout>('unified')
  // the find bar: a query over paths and content, and which matching file is in view
  const [findOpen, setFindOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [at, setAt] = useState(0)
  const findRef = useRef<HTMLInputElement>(null)
  const anchors = useRef<(HTMLDivElement | null)[]>([])

  useEffect(() => {
    getDiffLayout()
      .then(setLayout)
      .catch(() => {}) // the store unreadable: stay unified
  }, [])

  // the last pick is what the next diff opens with
  const pickLayout = (l: DiffLayout) => {
    setLayout(l)
    setDiffLayout(l).catch(() => {})
  }

  useEffect(() => {
    let live = true
    setFiles(null)
    setError(null)
    fetchPrDiff(repo, prNumber)
      .then((text) => {
        if (!live) return
        const parsed = parseDiff(text)
        setFiles(parsed)
        setOpen(new Set(parsed.flatMap((f, i) => (startsOpen(f, parsed.length) ? [i] : []))))
      })
      .catch((e) => live && setError(errText(e)))
    return () => {
      live = false
    }
  }, [repo, prNumber])

  const toggle = (i: number) =>
    setOpen((s) => {
      const next = new Set(s)
      if (!next.delete(i)) next.add(i)
      return next
    })

  const closeFind = useCallback(() => {
    setFindOpen(false)
    setQuery('')
    setAt(0)
  }, [])

  const openFind = useCallback(() => {
    setFindOpen(true)
    findRef.current?.focus()
    findRef.current?.select()
  }, [])

  // ⌘F on macOS, Ctrl+F on Linux: this listener is mounted and removed with the diff, so the
  // chord never opens find anywhere else in the app. Esc closes the bar instead of the diff.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (chord(e, 'f')) {
        if (!files?.length) return
        e.preventDefault()
        openFind()
        return
      }
      if (e.key === 'Escape' && findOpen) {
        e.preventDefault()
        e.stopPropagation()
        closeFind()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [files, findOpen, openFind, closeFind])

  // the input mounts with the bar, so focus it after the render that opens it
  useEffect(() => {
    if (!findOpen) return
    findRef.current?.focus()
    findRef.current?.select()
  }, [findOpen])

  const q = query.trim()
  const searching = q.length > 0
  const matches = useMemo(() => (files ? fileMatches(files, query) : []), [files, query])
  const hits = matches.reduce((n, m) => n + m.lines + (m.path ? 1 : 0), 0)

  // searching narrows the list to the files that match, by path or by any line
  const shown = useMemo(() => {
    const all = (files ?? []).map((_, i) => i)
    return searching ? all.filter((i) => matches[i].path || matches[i].lines > 0) : all
  }, [files, matches, searching])

  const cursor = shown.length ? Math.min(at, shown.length - 1) : 0
  const step = (d: number) => {
    if (shown.length) setAt((n) => (Math.min(n, shown.length - 1) + d + shown.length) % shown.length)
  }

  // bring the file in view when stepping, or when a new query leaves the previous pick out of range
  useEffect(() => {
    if (!searching || !shown.length) return
    anchors.current[shown[cursor]]?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [searching, shown, cursor])

  // a matching file opens itself, the way a browser's find shows what it hit; a click can still fold it
  useEffect(() => {
    if (!searching || !shown.length) return
    setOpen((s) => {
      const next = new Set(s)
      for (const i of shown) next.add(i)
      return next.size === s.size ? s : next
    })
  }, [searching, shown])

  const added = files?.reduce((n, f) => n + f.additions, 0) ?? 0
  const removed = files?.reduce((n, f) => n + f.deletions, 0) ?? 0

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-deck-900">
      <div className="flex items-center gap-2 border-b border-deck-800 px-4 py-2.5">
        <BackButton onClick={onBack} title="Back to the PR panel" />
        <p className="min-w-0 flex-1 truncate font-mono text-xs text-deck-400">
          {repo}#{prNumber} diff
        </p>
        {files && (
          <p className="shrink-0 text-xs text-deck-400">
            {files.length} file{files.length === 1 ? '' : 's'} <span className="text-grass-300">+{added}</span>{' '}
            <span className="text-red-300">-{removed}</span>
          </p>
        )}
        {files?.length ? (
          findOpen ? (
            <search className="flex shrink-0 items-center gap-1.5 rounded-md border border-deck-600 bg-deck-800 py-0.5 pl-2 pr-1">
              <span className="text-deck-500">
                <SearchIcon />
              </span>
              <input
                ref={findRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setAt(0)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    step(e.shiftKey ? -1 : 1)
                  }
                }}
                placeholder="Find in diff"
                aria-label="Search file paths and diff content"
                spellCheck={false}
                autoComplete="off"
                className="w-36 bg-transparent font-mono text-xs text-deck-100 outline-none placeholder:text-deck-600"
              />
              {searching && (
                <span className="shrink-0 whitespace-nowrap font-mono text-[11px] tabular-nums text-deck-500">
                  {shown.length ? cursor + 1 : 0}/{shown.length}
                  <span className="text-deck-600"> · </span>
                  {hits} hit{hits === 1 ? '' : 's'}
                </span>
              )}
              <span className="h-3.5 w-px shrink-0 bg-deck-700" />
              <button
                type="button"
                onClick={() => step(-1)}
                disabled={shown.length < 2}
                title="Previous file (Shift+Enter)"
                aria-label="Previous matching file"
                className="cursor-pointer rounded px-1 text-xs text-deck-400 hover:bg-deck-700 hover:text-deck-100 disabled:cursor-default disabled:opacity-40"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => step(1)}
                disabled={shown.length < 2}
                title="Next file (Enter)"
                aria-label="Next matching file"
                className="cursor-pointer rounded px-1 text-xs text-deck-400 hover:bg-deck-700 hover:text-deck-100 disabled:cursor-default disabled:opacity-40"
              >
                ↓
              </button>
              <button
                type="button"
                onClick={closeFind}
                title="Close (Esc)"
                aria-label="Close search"
                className="cursor-pointer rounded px-1 text-xs text-deck-400 hover:bg-deck-700 hover:text-deck-100"
              >
                ✕
              </button>
            </search>
          ) : (
            <button
              type="button"
              onClick={openFind}
              title={FIND_HINT ? `Find in diff (${FIND_HINT})` : 'Find in diff'}
              aria-label="Find in diff"
              className="shrink-0 cursor-pointer rounded border border-transparent p-1 text-deck-400 hover:border-deck-600 hover:bg-deck-800 hover:text-deck-100"
            >
              <SearchIcon />
            </button>
          )
        ) : null}
        <div className="flex shrink-0 overflow-hidden rounded border border-deck-600 text-xs">
          {(['unified', 'split'] as const).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => pickLayout(l)}
              aria-pressed={layout === l}
              className={`cursor-pointer px-2 py-0.5 capitalize ${
                layout === l ? 'bg-deck-700 text-deck-100' : 'text-deck-400 hover:bg-deck-800 hover:text-deck-200'
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto p-4">
        {error ? (
          <p className="m-auto text-sm text-red-300">Could not load the diff: {error}</p>
        ) : !files ? (
          <p className="m-auto flex items-center gap-2 text-deck-500">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-deck-500 border-t-transparent" />
            Loading diff…
          </p>
        ) : !files.length ? (
          <p className="m-auto text-deck-500">No file changes</p>
        ) : !shown.length ? (
          <p className="m-auto text-sm text-deck-500">No file matches “{q}”</p>
        ) : (
          shown.map((i) => (
            <FileBlock
              key={files[i].path}
              file={files[i]}
              open={open.has(i)}
              layout={layout}
              query={q}
              onToggle={() => toggle(i)}
              anchor={(el) => {
                anchors.current[i] = el
              }}
            />
          ))
        )}
      </div>
    </div>
  )
}
