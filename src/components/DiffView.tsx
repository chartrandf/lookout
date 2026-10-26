import { memo, useEffect, useMemo, useState } from 'react'
import { type DiffLayout, getDiffLayout, setDiffLayout } from '../lib/config'
import { type DiffFile, diffLines, parseDiff, type SplitCell, splitRows, startsOpen } from '../lib/diff'
import { fetchPrDiff } from '../lib/gh'
import { errText } from '../lib/log'
import { BackButton } from './BackButton'

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

const STATUS_LABEL: Record<DiffFile['status'], string | null> = {
  added: 'added',
  deleted: 'deleted',
  renamed: 'renamed',
  modified: null,
}

// One file's lines, numbered only once it's open: a folded file costs its header alone
const FileBody = memo(({ body }: { body: string[] }) => {
  const lines = useMemo(() => diffLines(body), [body])
  return (
    <div className="overflow-x-auto font-mono text-[11px] leading-[18px]">
      <div className="min-w-max">
        {lines.map((l, i) =>
          l.kind === 'hunk' ? (
            // biome-ignore lint/suspicious/noArrayIndexKey: a file's lines never reorder
            <div key={i} className="bg-sky-900/30 px-2 text-sky-300">
              {l.text}
            </div>
          ) : (
            // biome-ignore lint/suspicious/noArrayIndexKey: a file's lines never reorder
            <div key={i} className={`flex ${LINE_CLASS[l.kind]}`}>
              <span className="w-10 shrink-0 select-none pr-1 text-right text-deck-600">{l.old ?? ''}</span>
              <span className="w-10 shrink-0 select-none pr-1 text-right text-deck-600">{l.new ?? ''}</span>
              <span className="w-4 shrink-0 select-none text-center">
                {l.kind === 'add' ? '+' : l.kind === 'del' ? '-' : ' '}
              </span>
              <span className="whitespace-pre pr-4">{l.text}</span>
            </div>
          ),
        )}
      </div>
    </div>
  )
})

const Cell = ({ cell }: { cell: SplitCell | null }) => (
  <>
    <span className={`select-none pr-1 text-right text-deck-600 ${cell ? LINE_CLASS[cell.kind] : 'bg-deck-800/60'}`}>
      {cell?.n ?? ''}
    </span>
    {/* split halves wrap instead of scrolling: two scrollbars per file would drift apart */}
    <span className={`whitespace-pre-wrap break-all pr-2 ${cell ? LINE_CLASS[cell.kind] : 'bg-deck-800/60'}`}>
      {cell ? `${cell.kind === 'add' ? '+' : cell.kind === 'del' ? '-' : ' '}${cell.text}` : ''}
    </span>
  </>
)

// Side by side: removed lines left, their replacements right
const SplitBody = memo(({ body }: { body: string[] }) => {
  const rows = useMemo(() => splitRows(diffLines(body)), [body])
  return (
    <div className="grid grid-cols-[2.5rem_minmax(0,1fr)_2.5rem_minmax(0,1fr)] font-mono text-[11px] leading-[18px]">
      {rows.map((r, i) =>
        r.kind === 'hunk' ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: a file's rows never reorder
          <div key={i} className="col-span-4 bg-sky-900/30 px-2 text-sky-300">
            {r.text}
          </div>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: a file's rows never reorder
          <div key={i} className="contents">
            <Cell cell={r.left} />
            <Cell cell={r.right} />
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
  onToggle,
}: {
  file: DiffFile
  open: boolean
  layout: DiffLayout
  onToggle: () => void
}) => {
  const status = STATUS_LABEL[file.status]
  return (
    // shrink-0: overflow-hidden drops a flex item's min height, so files squeezed to fit instead of scrolling
    <div className="shrink-0 overflow-hidden rounded-md border border-deck-700">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full cursor-pointer items-center gap-2 bg-deck-800 px-3 py-1.5 text-left text-xs hover:bg-deck-700"
      >
        <span className="w-3 shrink-0 text-deck-500">{open ? '▾' : '▸'}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-deck-200">
          {file.oldPath ? `${file.oldPath} → ${file.path}` : file.path}
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
            <SplitBody body={file.body} />
          ) : (
            <FileBody body={file.body} />
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
        ) : (
          files.map((f, i) => (
            <FileBlock key={f.path} file={f} open={open.has(i)} layout={layout} onToggle={() => toggle(i)} />
          ))
        )}
      </div>
    </div>
  )
}
