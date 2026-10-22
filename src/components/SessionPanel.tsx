import { GitMergeIcon } from '@primer/octicons-react'
import { writeText } from '@tauri-apps/plugin-clipboard-manager'
import { readTextFile } from '@tauri-apps/plugin-fs'
import { openUrl } from '@tauri-apps/plugin-opener'
import { type ReactNode, type Ref, useCallback, useEffect, useRef, useState } from 'react'
import { avatarUrl } from '../lib/avatar'
import { cardActions, snoozeAction } from '../lib/cardactions'
import { listSlashCommands } from '../lib/commands'
import { subscribeCardEvents } from '../lib/db'
import { buildFeed, type FeedEvent, mergeReports, reportEvents, type TimelineSummary } from '../lib/feed'
import { approvePr, fetchChecks, fetchMergeOptions, mergePr } from '../lib/gh'
import { resumeInGhostty } from '../lib/ghostty'
import type { IconName } from '../lib/icons'
import { defaultAuto, MERGE_METHODS, type MergeOptions, pickMethod } from '../lib/merge'
import { type CheckItem, ciRatio } from '../lib/prboard'
import { onPrWindowClosed, openPrWindow } from '../lib/prwindow'
import { sessionOptions } from '../lib/replytarget'
import type { Run, RunLine } from '../lib/runs'
import { sessionCwd, transcriptPath } from '../lib/sessions'
import { STAGES } from '../lib/stages'
import { messageTime } from '../lib/time'
import { transcriptLines } from '../lib/transcript'
import type { ActionButton, MergeMethod, MergePreference, ReviewTask, Stage } from '../types'
import { ActionIcon } from './ActionIcon'
import { BackButton } from './BackButton'
import { CardActionIcon, CardMenuList } from './CardMenu'
import { ChecksBox } from './ChecksBox'
import { CloseButton } from './CloseButton'
import { CommandTextarea } from './CommandTextarea'
import { type Confirm, ConfirmDialog } from './ConfirmDialog'
import { FollowupBadge } from './FollowupBadge'
import { Icon, IconBox } from './Icon'
import { Markdown } from './Markdown'
import { PrLink } from './PrLink'
import { SessionPicker } from './SessionPicker'
import { SidePanel } from './SidePanel'
import { Tip } from './Tip'

type Props = {
  task: ReviewTask
  run: Run | undefined
  me: string
  myName?: string
  // 'review' = the Reviews board (adds a built-in approve button + stage select).
  // 'pr' = the Pull Requests board for my own PRs.
  variant?: 'review' | 'pr'
  mergeMethod: MergePreference // the Merge button's preselected strategy (Settings)
  buttons: ActionButton[] // user-configured action buttons, already filtered by their visibility conditions
  onReply: (text: string, sessionId: string | null) => void // null = start a new chat session
  onRunButton: (button: ActionButton) => void
  onMerged?: () => Promise<void> // after a merge from this panel: the board's merge action (Settings)
  onStageChange: (stage: Stage) => void
  onSnooze: (snoozed: boolean) => void
  onKill: () => void
  onCancel: () => void
  onClose: () => void
  // fired on open with the card summary derived from the freshly-fetched timeline (per-card refresh)
  onRefresh?: (summary: TimelineSummary) => void
  expandChecks?: boolean // opened from the card's CI badge: unfold the failing checks
  onOpenStream?: (itemId: string) => void // a Stream entry in the history: open that card on the Stream board
}

type ReplyBoxProps = {
  value: string
  onChange: (v: string) => void
  onSend: () => void
  onCancel: () => void
  canReply: boolean
  running: boolean
  placeholder: string
  tools?: ReactNode // options for the message to send, on the box's bottom row
  commands: string[] // skills + slash commands suggested on `/`
  autoFocus?: boolean // take the caret on mount
}

const ArrowUpIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M12 19V5M5 12l7-7 7 7" />
  </svg>
)

// Chat composer: the auto-growing field on top, a bottom row with the message's options on the left
// and send on the right. Enter sends, Shift+Enter adds a line, stop aborts a running turn
const ReplyBox = ({
  value,
  onChange,
  onSend,
  onCancel,
  canReply,
  running,
  placeholder,
  tools,
  commands,
  autoFocus,
}: ReplyBoxProps) => {
  const ref = useRef<HTMLTextAreaElement>(null)
  // biome-ignore lint/correctness/useExhaustiveDependencies: on mount only
  useEffect(() => {
    if (autoFocus) ref.current?.focus()
  }, [])
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-measure on every value change
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [value])
  return (
    <div className="flex flex-col rounded-2xl border border-deck-700 bg-deck-800 focus-within:border-deck-500">
      <CommandTextarea
        inputRef={ref}
        rows={1}
        value={value}
        commands={commands}
        placeholders={false}
        menuUp
        onChange={onChange}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            onSend()
          }
        }}
        disabled={!canReply}
        placeholder={running ? 'claude is working… stop to send something else' : placeholder}
        className="max-h-40 w-full resize-none overflow-y-auto bg-transparent px-3 pt-3 pb-1 text-sm outline-none placeholder:text-deck-500 disabled:opacity-50"
      />
      <div className="flex items-center gap-2 px-2 pb-2">
        <div className="flex min-w-0 flex-1 items-center">{tools}</div>
        {running ? (
          <Tip label="Stop this turn — the session stays resumable, then send a new message">
            <button
              type="button"
              onClick={onCancel}
              className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-red-500/30 text-red-100 hover:bg-red-500/50"
            >
              <span className="h-2.5 w-2.5 rounded-[2px] bg-current" />
            </button>
          </Tip>
        ) : (
          <Tip label="Send (Enter)">
            <button
              type="button"
              onClick={onSend}
              disabled={!canReply || !value.trim()}
              className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-grass-600 text-white hover:bg-grass-500 disabled:cursor-default disabled:opacity-40"
            >
              <ArrowUpIcon />
            </button>
          </Tip>
        )}
      </div>
    </div>
  )
}

const CheckIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="3"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="m4 12.5 5.5 5.5L20 6.5" />
  </svg>
)

// a session's state: spinning in place of the bubble's icon while it runs, then its color tints that icon
const STATUS_ICON: Record<NonNullable<FeedEvent['outcome']>, IconName> = {
  running: 'sync',
  ok: 'check-circle-fill',
  attention: 'alert',
  failed: 'x-circle',
}

// Hidden until its row is hovered (or it has focus, or just copied), then slides in from the left.
// Tailwind needs the full group-hover class names in the source, hence the map.
const SHOW_ON_HOVER = {
  url: 'group-hover/url:translate-x-0 group-hover/url:opacity-100',
  branch: 'group-hover/branch:translate-x-0 group-hover/branch:opacity-100',
}
const CopyButton = ({
  label,
  copied,
  onCopy,
  group,
}: {
  label: string
  copied: boolean
  onCopy: () => void
  group: keyof typeof SHOW_ON_HOVER
}) => (
  <Tip label={copied ? 'Copied' : label}>
    <button
      type="button"
      onClick={onCopy}
      className={`flex cursor-pointer items-center text-deck-500 transition duration-150 hover:text-grass-300 focus-visible:translate-x-0 focus-visible:opacity-100 ${
        copied ? 'opacity-100' : '-translate-x-1 opacity-0'
      } ${SHOW_ON_HOVER[group]}`}
    >
      <Icon name={copied ? 'check' : 'copy'} size={10} />
    </button>
  </Tip>
)

// URLs in session output: click to open in the in-app browser window
// (capture group -> odd split indexes are URLs; last char must not be trailing punctuation)
const URL_SPLIT = /(https?:\/\/[^\s<>"'`]*[^\s<>"'`.,;:!?)\]])/g

const Linkify = ({ text, onOpen }: { text: string; onOpen: (url: string, external: boolean) => void }) => (
  <>
    {text.split(URL_SPLIT).map((part, i) =>
      i % 2 === 1 ? (
        // biome-ignore lint/suspicious/noArrayIndexKey: static text snapshot
        <Tip key={i} label="Open in app browser (⌘+click for default browser)">
          <a
            href={part}
            onClick={(e) => {
              e.preventDefault()
              onOpen(part, e.metaKey)
            }}
            className="cursor-pointer underline decoration-dotted underline-offset-2 hover:text-grass-300"
          >
            {part}
          </a>
        </Tip>
      ) : (
        part
      ),
    )}
  </>
)

// One row per command instead of a wrapped wall of pale gray: the detail is truncated to a single
// line, click reveals the whole thing (heredoc bodies, long gh invocations).
const ToolLine = ({ text }: { text: string }) => {
  const [open, setOpen] = useState(false)
  const cut = text.indexOf(' ')
  const name = cut === -1 ? text : text.slice(0, cut)
  const detail = cut === -1 ? '' : text.slice(cut + 1)
  return (
    <Tip label={open ? 'Collapse' : text}>
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        className="flex w-full cursor-crosshair items-baseline gap-1.5 text-left font-mono text-xs leading-5 text-deck-500 hover:text-deck-300"
      >
        <span className="shrink-0 text-deck-400">{name}</span>
        <span className={open ? 'min-w-0 flex-1 whitespace-pre-wrap break-all' : 'min-w-0 flex-1 truncate'}>
          {detail}
        </span>
      </button>
    </Tip>
  )
}

// Our own prompt: action-button prompts are long, so clamp them until clicked.
const UserLine = ({ text, onOpen }: { text: string; onOpen: (url: string, external: boolean) => void }) => {
  const [open, setOpen] = useState(false)
  const long = text.length > 180 || text.includes('\n')
  const body = (
    <span className={open ? 'whitespace-pre-wrap' : 'line-clamp-2'}>
      ❯ <Linkify text={text} onOpen={onOpen} />
    </span>
  )
  return long ? (
    <Tip label={open ? 'Collapse' : 'Show the full prompt'}>
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        className="cursor-pointer text-left font-mono text-grass-300"
      >
        {body}
      </button>
    </Tip>
  ) : (
    <p className="font-mono text-grass-300">{body}</p>
  )
}

// Consecutive lines of the same kind render as one block: text groups become a single markdown
// document (so a table split across stream chunks still parses), tool groups a tight command list.
const groupLines = (lines: RunLine[]): RunLine[][] =>
  lines.reduce<RunLine[][]>((groups, l) => {
    const last = groups.at(-1)
    if (last && last[0].kind === l.kind) last.push(l)
    else groups.push([l])
    return groups
  }, [])

// A run's log as the terminal shows it, live or replayed from a session's transcript
const RunLog = ({ lines, onLink }: { lines: RunLine[]; onLink: (url: string, external: boolean) => void }) => (
  <>
    {groupLines(lines).map((group, gi) => {
      const kind = group[0].kind
      const key = gi // append-only log: groups only ever grow or get appended to
      if (kind === 'tool')
        return (
          <div key={key} className="flex flex-col rounded bg-deck-900/60 px-2 py-1">
            {group.map((l, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: append-only log
              <ToolLine key={i} text={l.text} />
            ))}
          </div>
        )
      if (kind === 'text')
        return (
          <Markdown key={key} className="md-console" text={group.map((l) => l.text).join('\n\n')} onLink={onLink} />
        )
      if (kind === 'user')
        return (
          <div key={key} className="flex flex-col gap-1">
            {group.map((l, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: append-only log
              <UserLine key={i} text={l.text} onOpen={onLink} />
            ))}
          </div>
        )
      return (
        <div key={key} className="flex flex-col gap-1">
          {group.map((l, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: append-only log
            <p key={i} className="font-mono text-xs text-red-400">
              <Linkify text={l.text} onOpen={onLink} />
            </p>
          ))}
        </div>
      )
    })}
  </>
)

type TerminalWindowProps = {
  label: string // right of `$ claude`: the run's command, or the session's title
  running: boolean
  open?: boolean // folded down to its title bar when false
  onToggle?: () => void // a title bar that folds the window; none = always open
  onKill?: () => void
  bodyRef?: Ref<HTMLDivElement>
  onScroll?: () => void
  className?: string
  children: ReactNode
}

// terminal window: title bar ($ claude · status · label), darker console body below. The live run
// above the history and a past session read back here (⌘+click) look the same
const TerminalWindow = ({
  label,
  running,
  open = true,
  onToggle,
  onKill,
  bodyRef,
  onScroll,
  className = '',
  children,
}: TerminalWindowProps) => {
  const title = (
    <>
      {onToggle && (
        <span className={`shrink-0 text-xs text-deck-500 transition-transform ${open ? 'rotate-90' : ''}`}>▸</span>
      )}
      <span className="text-grass-400">$</span>
      <span className="text-deck-200">claude</span>
      {running && (
        <>
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-400" />
          </span>
          <span className="text-amber-200">is working…</span>
        </>
      )}
      {label && <span className="ml-auto truncate text-xs text-deck-500">{label}</span>}
    </>
  )
  return (
    <div className={`flex min-h-0 flex-col overflow-hidden rounded-xl border border-deck-700 bg-deck-900 ${className}`}>
      <div
        className={`relative flex w-full items-center gap-2 px-4 py-2.5 font-mono text-sm ${open ? 'border-b border-deck-700' : ''}`}
      >
        {onToggle ? (
          <Tip label={open ? 'Collapse the terminal' : 'Expand the terminal'}>
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={open}
              className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left"
            >
              {title}
            </button>
          </Tip>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-2">{title}</div>
        )}
        {running && onKill && (
          <Tip label="Stop this run (the session stays resumable)">
            <button
              type="button"
              onClick={onKill}
              className="shrink-0 cursor-pointer rounded border border-red-400/40 bg-red-500/20 px-2 py-0.5 font-sans text-xs text-red-200 hover:bg-red-500/40"
            >
              ■ stop
            </button>
          </Tip>
        )}
        {/* progress runs along the header's bottom border, under the $ claude line */}
        {running && (
          <div className="absolute inset-x-0 -bottom-px h-0.5 overflow-hidden" aria-hidden>
            <div className="terminal-progress h-full bg-amber-400" />
          </div>
        )}
      </div>
      <div
        ref={bodyRef}
        onScroll={onScroll}
        hidden={!open}
        className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto bg-deck-950 px-4 py-3 text-sm"
      >
        {children}
        {running && <span className="h-4 w-2 shrink-0 animate-pulse bg-grass-400/80" aria-hidden />}
      </div>
    </div>
  )
}

const feedName = (e: FeedEvent) => (e.actor === 'Lookout' ? 'Lookout' : e.mine ? 'You' : e.actor || 'Lookout')

// Lucide "reply": marks a report as the answer to the session stacked behind it
const ReplyIcon = () => (
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
    <polyline points="9 17 4 12 9 7" />
    <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
  </svg>
)

// Who a history message is from: the GitHub picture, or an emoji for what has no account. A login
// that doesn't resolve (a commit carries a git author name, not a login) falls back to its initial.
// A badge (my picture, on Lookout's 👀: it acts for me) sits small over the bottom-right corner.
const FeedAvatar = ({ avatar, name }: { avatar: FeedEvent['avatar']; name: string }) => {
  const [broken, setBroken] = useState(false)
  // one visible 28px circle for every kind, so an emoji reads the same size as a photo
  const cls = 'flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-deck-700 ring-1 ring-deck-600'
  const face =
    'emoji' in avatar ? (
      <span className={`${cls} text-lg leading-none`} role="img" aria-label={name}>
        {avatar.emoji}
      </span>
    ) : broken ? (
      <span className={`${cls} text-sm font-medium text-deck-300`}>{name.charAt(0).toUpperCase()}</span>
    ) : (
      <img
        src={avatar.url ?? avatarUrl(avatar.login)}
        alt={name}
        onError={() => setBroken(true)}
        className={`${cls} object-cover`}
      />
    )
  // mt: clear the name line (leading-4 + mb-0.5) so the avatar sits beside the bubble, not the name
  return (
    <span className="relative mt-[20px] shrink-0">
      {face}
      {'badge' in avatar && avatar.badge && (
        <img
          src={avatarUrl(avatar.badge)}
          alt=""
          aria-hidden
          className="absolute -right-1 -bottom-1.5 h-4 w-4 rounded-full object-cover ring-1 ring-deck-950"
        />
      )}
    </span>
  )
}

// placeholder bubbles in the shape of the chat, bottom-anchored like the real one so nothing jumps on load
const SKELETON = [
  { mine: false, w: '55%' },
  { mine: false, w: '35%' },
  { mine: true, w: '45%' },
  { mine: false, w: '50%' },
]

const FeedSkeleton = () => (
  <ul aria-label="Loading history" className="flex animate-pulse flex-col gap-4">
    {SKELETON.map((b, i) => (
      // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder
      <li key={i} className={`flex items-end gap-2 ${b.mine ? 'flex-row-reverse' : ''}`}>
        <span className="h-7 w-7 shrink-0 rounded-full bg-deck-800" />
        <span style={{ width: b.w }} className="h-9 rounded-[18px] bg-deck-800" />
      </li>
    ))}
  </ul>
)

export const SessionPanel = ({
  task,
  run,
  me,
  myName = '',
  variant = 'review',
  mergeMethod,
  buttons,
  onReply,
  onRunButton,
  onMerged,
  onStageChange,
  onSnooze,
  onKill,
  onCancel,
  onClose,
  onRefresh,
  expandChecks = false,
  onOpenStream,
}: Props) => {
  const isPr = variant === 'pr'
  const [input, setInput] = useState('')
  const [copiedBranch, setCopiedBranch] = useState(false)
  const [copiedUrl, setCopiedUrl] = useState(false)
  const [approving, setApproving] = useState(false)
  const [approved, setApproved] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [mergeOpts, setMergeOpts] = useState<MergeOptions | null>(null)
  const [method, setMethod] = useState<MergeMethod | null>(null) // what the Merge button will do
  const [methodMenu, setMethodMenu] = useState(false)
  const [auto, setAuto] = useState(false) // the Merge button enables auto-merge instead of merging now
  const [autoOn, setAutoOn] = useState(false) // auto-merge enabled from this panel: nothing left to click
  const [merging, setMerging] = useState(false)
  const [mergeError, setMergeError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<Confirm | null>(null)
  const [feed, setFeed] = useState<FeedEvent[] | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [report, setReport] = useState<{ title: string; content: string } | null>(null)
  // a past session read back in Lookout (⌘+click on its bubble), instead of resuming it in Ghostty
  // `from`: where the live run's lines go past what the file held when read (the run was live then)
  // a past session picked under the input: the terminal shows its transcript (null lines = loading)
  const [picked, setPicked] = useState<{ id: string; lines: RunLine[] | null } | null>(null)
  const [transcript, setTranscript] = useState<{
    id: string
    title: string
    lines: RunLine[] | null
    base?: Run
    from: number
  } | null>(null)
  const transcriptBodyRef = useRef<HTMLDivElement>(null)
  const transcriptFollowRef = useRef(true) // like the terminal: tail the session until scrolled away
  const [checks, setChecks] = useState<CheckItem[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)
  const runRef = useRef<HTMLDivElement>(null)
  const followRef = useRef(true) // terminal tails the output until you scroll away from the bottom
  const [termOpen, setTermOpen] = useState(true) // the terminal folds down to its $ claude title bar
  const autoTopRef = useRef(-1)
  const reportRef = useRef<{ title: string; content: string } | null>(null)
  reportRef.current = report
  const transcriptRef = useRef(false)
  transcriptRef.current = !!transcript
  const confirmOpenRef = useRef(false)
  confirmOpenRef.current = !!confirm
  const methodMenuRef = useRef(false)
  methodMenuRef.current = methodMenu
  // the session the input talks to: undefined follows the latest one, null is a new chat
  const [pick, setPick] = useState<string | null | undefined>(undefined)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [commands, setCommands] = useState<string[]>([]) // this repo's skills + slash commands, for `/`
  const pickerOpenRef = useRef(false)
  pickerOpenRef.current = pickerOpen
  const mergeBoxRef = useRef<HTMLDivElement>(null)
  const taskRef = useRef(task)
  taskRef.current = task
  const feedSeq = useRef(0) // the latest full build; an older one landing after it is dropped

  // A full build fetches the timeline, so it can land after a report was linked meanwhile: its reports
  // are re-read once it's back, from the card as it is by then, and a superseded build is thrown away.
  const loadFeed = async () => {
    const seq = ++feedSeq.current
    const r = await buildFeed(task, me, myName)
    const feed = mergeReports(r.feed, await reportEvents(taskRef.current, me))
    if (seq !== feedSeq.current) return
    setFeed(feed)
    onRefresh?.(r.summary) // patch this card from the timeline we just fetched
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: rebuild feed when switching task
  useEffect(() => {
    setFeed(null)
    setReport(null)
    setTranscript(null)
    scrollRef.current?.scrollTo({ top: 0 }) // column-reverse: top 0 is the bottom, newest events
    loadFeed()
  }, [task.id])

  // Reports are Lookout's own, so the open card shows one as soon as it's stored: a finished run and
  // every sync hand in a fresh card, and its reports are merged in without refetching the timeline.
  // biome-ignore lint/correctness/useExhaustiveDependencies: a fresh card object is the trigger
  useEffect(() => {
    let live = true
    reportEvents(task, me).then((reports) => {
      if (live) setFeed((f) => f && mergeReports(f, reports))
    })
    return () => {
      live = false
    }
  }, [task])

  // a merge action moves on its own (a session id arrives, a command finishes): re-read the history.
  // Only the latest read lands, and only on the card it was read for.
  const cardEventSeq = useRef(0)
  useEffect(
    () =>
      subscribeCardEvents((id) => {
        if (id !== taskRef.current.id) return
        const seq = ++cardEventSeq.current
        reportEvents(taskRef.current, me)
          .then((reports) => {
            if (seq !== cardEventSeq.current || taskRef.current.id !== id) return
            setFeed((f) => f && mergeReports(f, reports))
          })
          .catch(() => {}) // logged by feed.ts
      }),
    [me],
  )

  // the per-check list behind a red build; refetched when the card's CI verdict moves
  // biome-ignore lint/correctness/useExhaustiveDependencies: refetch when switching task or CI state
  useEffect(() => {
    let live = true
    setChecks([])
    if (task.ciState !== 'fail' || task.prState !== 'open') return
    fetchChecks(task.repo, task.prNumber)
      .then((c) => live && setChecks(c))
      .catch(() => null) // logged by gh.ts; no box rather than a broken one
    return () => {
      live = false
    }
  }, [task.id, task.prState, task.ciState, task.ciChecks?.failed, task.ciChecks?.total])

  // which strategies this repo allows, for the Merge button (an open PR only)
  // biome-ignore lint/correctness/useExhaustiveDependencies: refetch when switching task
  useEffect(() => {
    setMergeOpts(null)
    setMergeError(null)
    setMethodMenu(false)
    setAutoOn(false)
    if (task.prState !== 'open') return
    fetchMergeOptions(task.repo)
      .then((o) => {
        setMergeOpts(o)
        setMethod(pickMethod(o, mergeMethod))
      })
      .catch(() => setMergeOpts(null)) // logged by gh.ts; no button rather than a broken one
  }, [task.id, task.prState])

  // auto-merge leads while CI runs, a plain merge once it's green (defaultAuto)
  useEffect(() => {
    setAuto(!!mergeOpts && defaultAuto(mergeOpts, task.ciState))
  }, [mergeOpts, task.ciState])

  // the strategy menu closes on any click outside the Merge button and its menu
  useEffect(() => {
    if (!methodMenu) return
    const outside = (e: MouseEvent) => {
      if (!mergeBoxRef.current?.contains(e.target as Node)) setMethodMenu(false)
    }
    document.addEventListener('mousedown', outside)
    return () => document.removeEventListener('mousedown', outside)
  }, [methodMenu])

  useEffect(() => {
    listSlashCommands(task.repoPath ? [task.repoPath] : [])
      .then(setCommands)
      .catch(() => setCommands([]))
  }, [task.repoPath])

  // another card talks to its own latest session
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset trigger only
  useEffect(() => {
    setPick(undefined)
    setPickerOpen(false)
  }, [task.id])

  // a fresh run (or another card) starts tailing again
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-arm triggers only
  useEffect(() => {
    followRef.current = true
  }, [run, task.id])

  const running = run?.status === 'running'
  // a new turn (or another card) unfolds the terminal so its output is seen
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-open triggers only
  useEffect(() => {
    if (running) setTermOpen(true)
  }, [running, task.id])

  // biome-ignore lint/correctness/useExhaustiveDependencies: follow the growing log
  useEffect(() => {
    const el = runRef.current
    if (!el || !followRef.current) return
    el.scrollTop = el.scrollHeight
    autoTopRef.current = el.scrollTop
  }, [run?.lines.length])

  // scrolling up stops the tail, snapping back to the bottom starts it again
  const onRunScroll = () => {
    const el = runRef.current
    if (!el) return
    if (el.scrollHeight - el.scrollTop - el.clientHeight <= 16) followRef.current = true
    // ignore the echo of our own scroll: lines appended since then grew scrollHeight, not scrollTop
    else if (el.scrollTop !== autoTopRef.current) followRef.current = false
  }

  // refresh history when a run finishes (no manual ↻ needed); its report comes in with the card above
  const runIdle = run?.status === 'awaiting-input' || run?.status === 'closed'
  const reloadFeed = () => {
    setRefreshing(true)
    loadFeed().finally(() => setRefreshing(false))
  }
  // biome-ignore lint/correctness/useExhaustiveDependencies: refresh trigger only
  useEffect(() => {
    if (runIdle) reloadFeed()
  }, [runIdle])

  // back from the in-app browser (often a merge there): refresh like the ↻ button would
  const reloadFeedRef = useRef(reloadFeed)
  reloadFeedRef.current = reloadFeed
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-subscribe per card only
  useEffect(() => {
    const sub = onPrWindowClosed(task.repo, task.prNumber, () => reloadFeedRef.current())
    return () => {
      sub.then((off) => off())
    }
  }, [task.id])

  const openReport = async (path: string) => {
    const title = path.split('/').at(-1) ?? path
    try {
      setReport({ title, content: await readTextFile(path) })
    } catch {
      setReport({ title, content: '(could not read report file)' })
    }
  }

  // a captured review has no file behind it: the markdown itself travelled on the feed event, and
  // the event's own wording is the title — a follow-up must not open under a review's name
  const openCaptured = (content: string, title: string) => setReport({ title, content })

  const send = (to: string | null) => {
    if (!input.trim()) return
    onReply(input.trim(), to)
    setInput('')
    if (to === null) setPick(undefined) // the new chat becomes the latest session: follow it
  }

  // Esc first closes the report overlay if it's open; otherwise the shell closes the panel
  const onEscape = useCallback(() => {
    if (confirmOpenRef.current) return true // the dialog closes itself on Esc; keep the panel open
    if (methodMenuRef.current) {
      setMethodMenu(false)
      return true
    }
    if (pickerOpenRef.current) {
      setPickerOpen(false)
      return true
    }
    if (transcriptRef.current) {
      setTranscript(null)
      return true
    }
    if (!reportRef.current) return false
    setReport(null)
    return true
  }, [])

  const sessionId = run?.sessionId ?? task.sessionIds.at(-1)
  // generic chat, always there: the input talks to the latest session (live run -> reply into it;
  // none -> resume the last one), and with no session yet it starts a new one on the PR's branch.
  // Only a repo without a local clone can't chat: claude needs a checkout to run in.
  const canReply = !running && (!!run?.sessionId || !!task.repoPath)
  const options = sessionOptions(feed, run)
  const chatTo = pick === undefined ? (sessionId ?? null) : pick
  const chatPlaceholder = !task.repoPath
    ? `No local clone for ${task.repo} — add it in Settings to chat`
    : chatTo
      ? 'Message this session…'
      : 'Ask claude about this PR (starts a new session)…'

  // Resuming only works from the directory the session ran in, which for a PR branch is usually a
  // worktree, not the clone. A live run already knows its own cwd; otherwise go find it.
  const checkoutFor = async (id: string) =>
    run?.sessionId === id ? run.repoPath : await sessionCwd(task.repoPath ?? '', id)

  const copyBranch = async () => {
    await writeText(task.branch)
    setCopiedBranch(true)
    setTimeout(() => setCopiedBranch(false), 1500)
  }

  const copyUrl = async () => {
    await writeText(task.prUrl)
    setCopiedUrl(true)
    setTimeout(() => setCopiedUrl(false), 1500)
  }

  // Approve and Merge never show together: not approved yet -> Approve, approved -> Merge, at any stage.
  // task.approved is the DB's copy from the last sync, so the buttons don't wait for the feed; the feed
  // catches an approval given since that sync, and `approved` one just given from this panel.
  const iApproved = feed?.some((e) => e.mine && e.text.startsWith('review: approved'))
  const prApproved = task.approved || approved || !!iApproved

  const approve = async () => {
    setApproving(true)
    try {
      await approvePr(task.repo, task.prNumber)
      setApproved(true)
      onStageChange('done') // approved = my part is over; merging is the author's business
    } finally {
      setApproving(false)
    }
  }

  const merge = async (m: MergeMethod) => {
    setMerging(true)
    setMergeError(null)
    try {
      if (auto) {
        // nothing merged yet: the card stays put, GitHub merges once the requirements pass
        await mergePr(task.repo, task.prNumber, m, true)
        setAutoOn(true)
        return
      }
      await mergePr(task.repo, task.prNumber, m)
      if (!isPr) onStageChange('done')
      // the board's merge action: stored before the feed reloads, so the history shows it at once
      await onMerged?.().catch(() => {}) // logged by App
      reloadFeed() // the merged event patches the card's state through onRefresh
    } catch (e) {
      setMergeError(e instanceof Error ? e.message.replace(/^.*failed: /s, '') : String(e))
    } finally {
      setMerging(false)
    }
  }

  // a red build doesn't block the merge (GitHub decides whether checks are required), it only warns
  const askMerge = () => {
    if (!method) return
    const label = MERGE_METHODS.find((x) => x.value === method)?.label ?? method
    const repoPr = `${task.repo.split('/')[1]}#${task.prNumber}`
    if (auto)
      return setConfirm({
        title: `Enable auto-merge on ${repoPr}?`,
        body: `${label} once all requirements pass.`,
        confirmLabel: 'Enable auto-merge',
        onConfirm: () => merge(method),
      })
    const red = task.ciState === 'fail'
    const checks = task.ciChecks ? ` (${ciRatio(task.ciChecks)} checks passed)` : ''
    setConfirm({
      title: `Merge ${repoPr}?`,
      body: red ? (
        <>
          {label}. <Icon name="alert" /> CI is red{checks} — merge anyway?
        </>
      ) : (
        `${label}.`
      ),
      confirmLabel: red ? 'Merge anyway' : 'Merge',
      onConfirm: () => merge(method),
    })
  }

  const mergeBlocked = task.conflicts
    ? 'Merge conflicts — fix the branch first'
    : task.isDraft
      ? 'Draft — mark it ready for review first'
      : null
  const showMerge = task.prState === 'open' && prApproved && !!method && !!mergeOpts
  const methodLabel = MERGE_METHODS.find((x) => x.value === method)?.label
  const hasMenu = !!mergeOpts && (mergeOpts.allowed.length > 1 || mergeOpts.autoMerge)

  // same label + tooltip as the ⋯ menu's row (cardactions.ts), for the PR panel's standalone button
  const snooze = snoozeAction(task.snoozed)

  // Ghostty deep link; falls back to copying the resume command when Ghostty is missing
  const resumeSession = async (id: string) => {
    if (!task.repoPath) return
    await resumeInGhostty(await checkoutFor(id), id)
  }

  const readSession = async (id: string, title: string) => {
    if (!task.repoPath) return
    const base = run?.sessionId === id ? run : undefined
    setTranscript({ id, title, lines: null, base, from: base?.lines.length ?? 0 })
    transcriptFollowRef.current = true
    let lines: RunLine[]
    try {
      lines = transcriptLines((await readTextFile(await transcriptPath(await checkoutFor(id), id))).split('\n'))
    } catch {
      lines = [{ kind: 'error', text: "could not read this session's transcript" }]
    }
    setTranscript((t) => (t?.id === id ? { ...t, lines } : t))
  }

  // A session picked under the input takes over the terminal: the live run when it's that session (or
  // one still starting), else what its transcript has stored.
  const showPicked = typeof pick === 'string' && run?.sessionId !== pick && !(running && !run?.sessionId)
  // biome-ignore lint/correctness/useExhaustiveDependencies: reload per picked session only
  useEffect(() => {
    if (!showPicked || !task.repoPath) return setPicked(null)
    const id = pick as string
    let live = true
    setPicked({ id, lines: null })
    setTermOpen(true)
    followRef.current = true
    checkoutFor(id)
      .then((cwd) => transcriptPath(cwd, id))
      .then(readTextFile)
      .then((text) => transcriptLines(text.split('\n')))
      .catch(() => []) // nothing stored: the terminal says so
      .then((lines) => live && setPicked({ id, lines }))
    return () => {
      live = false
    }
  }, [showPicked, pick, task.id])

  // biome-ignore lint/correctness/useExhaustiveDependencies: follow the picked session's output
  useEffect(() => {
    const el = runRef.current
    if (el && followRef.current) el.scrollTop = el.scrollHeight
  }, [picked?.lines])

  const pickedOption = picked ? options.find((o) => o.sessionId === picked.id) : undefined
  const pickedLabel = pickedOption
    ? `${pickedOption.label}${pickedOption.ts ? ` · ${new Date(pickedOption.ts).toLocaleString()}` : ''}`
    : 'session'
  const showRun = !picked && !!run && (running || run.lines.length > 0)

  // a message sent from the session view streams in under its transcript, from the card's run
  const transcriptLive = !!transcript && !!run && run.sessionId === transcript.id
  const transcriptTail = transcriptLive && run ? run.lines.slice(run === transcript?.base ? transcript.from : 0) : []
  const transcriptRunning = transcriptLive && running

  // biome-ignore lint/correctness/useExhaustiveDependencies: follow the transcript and its live tail
  useEffect(() => {
    const el = transcriptBodyRef.current
    if (el && transcriptFollowRef.current) el.scrollTop = el.scrollHeight
  }, [transcript?.lines, transcriptTail.length])

  const onTranscriptScroll = () => {
    const el = transcriptBodyRef.current
    if (el) transcriptFollowRef.current = el.scrollHeight - el.scrollTop - el.clientHeight <= 16
  }

  const openLink = (url: string, external: boolean) => openPrWindow(url, task.repo, task.prNumber, external)

  return (
    <SidePanel onClose={onClose} onEscape={onEscape}>
      {({ close }) => (
        <>
          <div className="border-b border-deck-800 px-4 py-3">
            {/* GitHub's hovercard line: repo#number, the copy icon slides in on row hover */}
            <div className="group/url flex items-center gap-2">
              <span className="shrink-0 text-xs text-deck-500">
                <PrLink
                  url={task.prUrl}
                  repo={task.repo}
                  prNumber={task.prNumber}
                  className="text-deck-400 underline decoration-deck-600 hover:text-grass-300"
                >
                  {task.repo}#{task.prNumber}
                </PrLink>
              </span>
              <CopyButton label="Copy PR URL" copied={copiedUrl} onCopy={copyUrl} group="url" />
              <div className="ml-auto flex items-center gap-1.5">
                {!isPr && (
                  <select
                    value={task.stage}
                    onChange={(e) => onStageChange(e.target.value as Stage)}
                    className="h-7 cursor-pointer rounded border border-deck-600 bg-deck-800 px-1.5 text-xs text-deck-200 outline-none"
                  >
                    {STAGES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                )}
                {isPr ? (
                  // my own PR's ⋯ was only Snooze + Open in browser (the header link already opens it;
                  // a run's stop and a session's resume live in the feed), so snooze gets its own button
                  <Tip label={`${snooze.label}: ${snooze.title}`}>
                    <button
                      type="button"
                      onClick={() => {
                        onSnooze(!task.snoozed)
                        // snoozing hides the card, so leave the panel; unsnoozing keeps it open
                        if (!task.snoozed) close()
                      }}
                      aria-label={snooze.label}
                      aria-pressed={task.snoozed}
                      className={`flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded border text-sm ${
                        task.snoozed
                          ? 'border-grass-600 bg-grass-600/20 text-grass-300'
                          : 'border-deck-600 text-deck-300 hover:bg-deck-800 hover:text-deck-100'
                      }`}
                    >
                      <CardActionIcon id="snooze" />
                    </button>
                  </Tip>
                ) : (
                  <div className="relative">
                    <Tip label="More options">
                      <button
                        type="button"
                        onClick={() => setMoreOpen((s) => !s)}
                        className="flex h-7 w-7 cursor-pointer items-center justify-center rounded border border-deck-600 text-sm text-deck-300 hover:bg-deck-700"
                      >
                        ⋯
                      </button>
                    </Tip>
                    {moreOpen && (
                      <div className="absolute right-0 top-full z-40 mt-1 flex w-60 flex-col rounded-md border border-deck-700 bg-deck-800 py-1 shadow-xl">
                        <CardMenuList
                          actions={cardActions({ snoozed: task.snoozed, hasSession: !!sessionId, isPr, running })}
                          onSelect={(id) => {
                            setMoreOpen(false)
                            if (id === 'snooze') {
                              onSnooze(!task.snoozed)
                              // snoozing hides the card, so leave the panel; unsnoozing keeps it open
                              if (!task.snoozed) close()
                            } else if (id === 'resume' && sessionId) resumeSession(sessionId)
                            else if (id === 'open-browser') openUrl(task.prUrl)
                            else if (id === 'remove') {
                              onStageChange('discovered')
                              close()
                            } else if (id === 'kill') onKill()
                          }}
                        />
                      </div>
                    )}
                  </div>
                )}
                <CloseButton onClick={close} />
              </div>
            </div>
            <h2 className="mt-2.5 text-[20px] font-semibold leading-snug text-white">{task.prTitle}</h2>
            <div className="group/branch mt-1.5 flex items-center gap-1.5 text-xs">
              <code className="truncate rounded border border-deck-700 bg-deck-800 px-1.5 py-0.5 font-mono text-deck-300">
                {task.branch}
              </code>
              <CopyButton label="Copy branch name" copied={copiedBranch} onCopy={copyBranch} group="branch" />
            </div>
          </div>

          <div className="flex flex-wrap gap-2 border-b border-deck-800 px-4 py-2">
            {buttons.map((b, i) => (
              <Tip key={b.id} label={b.prompt}>
                <button
                  type="button"
                  onClick={() => onRunButton(b)}
                  disabled={running}
                  className={
                    i === 0
                      ? 'cursor-pointer rounded-md bg-grass-600 px-3 py-1.5 text-sm hover:bg-grass-500 disabled:opacity-50'
                      : 'cursor-pointer rounded-md border border-grass-600 px-3 py-1.5 text-sm text-grass-300 hover:bg-grass-600/20 disabled:opacity-50'
                  }
                >
                  <span className="flex items-center gap-1.5">
                    <ActionIcon name={b.icon} /> {b.label}
                  </span>
                </button>
              </Tip>
            ))}
            <div className="ml-auto flex gap-2">
              {!isPr && !prApproved && (
                <Tip label="Approve the PR on GitHub and move it to Done">
                  <button
                    type="button"
                    onClick={approve}
                    disabled={approving}
                    className="cursor-pointer rounded-md bg-grass-600 px-3 py-1.5 text-sm hover:bg-grass-500 disabled:opacity-60"
                  >
                    <span className="flex items-center gap-1.5">
                      <CheckIcon /> {approving ? 'Approving…' : 'Approve'}
                    </span>
                  </button>
                </Tip>
              )}
              {showMerge && mergeOpts && method && (
                <div ref={mergeBoxRef} className="relative flex">
                  <Tip
                    label={
                      mergeBlocked ??
                      (autoOn
                        ? 'GitHub merges it once all requirements pass'
                        : auto
                          ? `${methodLabel} once all requirements pass`
                          : `${methodLabel} on GitHub`)
                    }
                  >
                    <button
                      type="button"
                      onClick={askMerge}
                      disabled={merging || !!mergeBlocked || (auto && autoOn)}
                      className={`cursor-pointer bg-grass-600 px-3 py-1.5 text-sm hover:bg-grass-500 disabled:cursor-not-allowed disabled:opacity-50 ${
                        hasMenu ? 'rounded-l-md' : 'rounded-md'
                      }`}
                    >
                      <span className="flex items-center gap-1.5">
                        <GitMergeIcon size={14} />
                        {merging
                          ? auto
                            ? 'Enabling…'
                            : 'Merging…'
                          : auto
                            ? autoOn
                              ? 'Auto-merge on'
                              : 'Enable auto-merge'
                            : method === 'merge'
                              ? 'Merge PR'
                              : method === 'squash'
                                ? 'Squash & merge'
                                : 'Rebase & merge'}
                      </span>
                    </button>
                  </Tip>
                  {hasMenu && (
                    <Tip label="Pick another merge strategy">
                      <button
                        type="button"
                        onClick={() => setMethodMenu((s) => !s)}
                        disabled={merging || !!mergeBlocked}
                        className="cursor-pointer rounded-r-md border-l border-black/20 bg-grass-600 px-[9px] py-1.5 text-sm hover:bg-grass-500 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        ▾
                      </button>
                    </Tip>
                  )}
                  {methodMenu && (
                    <div className="absolute right-0 top-full z-40 mt-1 flex w-56 flex-col rounded-md border border-deck-700 bg-deck-800 py-1 shadow-xl">
                      {mergeOpts.autoMerge && (
                        <button
                          type="button"
                          onClick={() => {
                            setAuto(true)
                            setMethodMenu(false)
                          }}
                          className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-sm text-deck-200 hover:bg-deck-700"
                        >
                          <span className="w-3 text-grass-400">{auto ? '✓' : ''}</span>
                          Enable auto-merge
                        </button>
                      )}
                      {MERGE_METHODS.filter((m) => mergeOpts.allowed.includes(m.value)).map((m) => (
                        <button
                          key={m.value}
                          type="button"
                          onClick={() => {
                            setMethod(m.value)
                            setAuto(false)
                            setMethodMenu(false)
                          }}
                          className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-sm text-deck-200 hover:bg-deck-700"
                        >
                          <span className="w-3 text-grass-400">{!auto && m.value === method ? '✓' : ''}</span>
                          {m.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            {mergeError && <p className="w-full text-xs text-red-300">could not merge: {mergeError}</p>}
          </div>

          <div className="flex min-h-0 flex-1 flex-col bg-deck-950">
            <h4 className="flex shrink-0 items-center justify-between px-4 pt-4 pb-2 text-xs font-semibold uppercase tracking-wide text-deck-400">
              history
              <Tip label="Refresh history">
                <button
                  type="button"
                  onClick={reloadFeed}
                  disabled={refreshing}
                  className="cursor-pointer text-deck-500 hover:text-deck-200 disabled:cursor-default"
                >
                  <span className={`inline-block ${refreshing ? 'animate-spin' : ''}`}>↻</span>
                </button>
              </Tip>
            </h4>
            {/* column-reverse anchors the chat to the bottom natively: short history sits next to the
                terminal and reply box, and the view stays pinned to the newest event while the terminal resizes */}
            <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col-reverse overflow-y-auto px-4 pb-4">
              {!feed ? (
                <FeedSkeleton />
              ) : feed.length === 0 ? (
                <p className="m-auto text-sm text-deck-500">No events yet.</p>
              ) : (
                <ul className="flex flex-col">
                  {feed.map((e, i) => {
                    // a report reads as a title ("Review done (See Report)", after its file icon)
                    const isReport = Boolean(e.filePath || e.body)
                    const isOutput = isReport && e.cardEventId !== undefined // a merge action's output
                    const isCommit = e.icon === 'git-commit'
                    const name = feedName(e)
                    // a run of messages from one person shows who once, on its first message
                    const prev = feed[i - 1]
                    const grouped = prev !== undefined && prev.mine === e.mine && feedName(prev) === name
                    // ✓✓ = that claude session has concluded (not running anymore)
                    // a merge action runs beside the card's run, so its own status tells
                    const running =
                      e.outcome === 'running' ||
                      (!!e.sessionId && run?.sessionId === e.sessionId && run.status === 'running')
                    const done = e.sessionId && !running
                    const meta = (
                      <>
                        {messageTime(e.ts)}
                        {done && <span className="ml-1 text-grass-400">✓✓</span>}
                      </>
                    )
                    // messenger-style stamp: an invisible copy at the end of the text reserves the room, so
                    // the real one, pinned bottom-right and dipping into the bottom padding, shares the last
                    // line when it fits and wraps when not
                    const body = (
                      <>
                        {/* a running session spins in place of its own icon */}
                        <IconBox
                          name={running ? STATUS_ICON.running : e.icon}
                          tone={!running && e.outcome ? STATUS_ICON[e.outcome] : undefined}
                          className={`mr-1.5 ${running ? 'animate-spin' : ''}`}
                        />
                        <span
                          // a commit message reads like GitHub's: mono, always underlined
                          className={isCommit ? 'font-mono text-xs underline' : ''}
                        >
                          {e.text}
                          {isReport && (isOutput ? ' (See output) ↗' : ' (See Report) ↗')}
                        </span>
                        {/* its own line, kept whole; the time stamp still shares it when it fits */}
                        {e.followup && (
                          <>
                            <br />
                            <FollowupBadge
                              summary={e.followup}
                              className="mt-1 inline-block text-xs whitespace-nowrap text-deck-300"
                            />
                          </>
                        )}
                        <span aria-hidden className="invisible ml-2 text-[10px]">
                          {meta}
                        </span>
                        <Tip label={`${new Date(e.ts).toLocaleString()}${done ? ' · session completed' : ''}`}>
                          <span className="absolute right-2.5 bottom-1 text-[10px] text-deck-500">{meta}</span>
                        </Tip>
                      </>
                    )
                    // 18px = half a one-line bubble (8 + 20 + 8 px tall, leading-5 so an icon can't grow the
                    // line): one line reads as a pill, centred, more lines as a softly squared box
                    const bubbleClass = `relative rounded-[18px] border py-2 pr-3 pl-2.5 text-sm leading-5 ${
                      e.mine
                        ? 'border-grass-700/60 bg-grass-600/25 text-grass-100'
                        : 'border-deck-700 bg-deck-800 text-deck-200'
                    }`
                    const bubble =
                      e.filePath || e.body || e.url || e.sessionId || e.streamItemId ? (
                        <button
                          type="button"
                          onClick={(ev) =>
                            e.streamItemId
                              ? onOpenStream?.(e.streamItemId)
                              : e.body
                                ? openCaptured(e.body, e.text)
                                : e.filePath
                                  ? openReport(e.filePath)
                                  : e.sessionId
                                    ? ev.metaKey
                                      ? readSession(e.sessionId, e.text)
                                      : resumeSession(e.sessionId)
                                    : openPrWindow(e.url as string, task.repo, task.prNumber, ev.metaKey)
                          }
                          className={`${bubbleClass} cursor-pointer text-left transition-colors duration-150 ${
                            e.mine
                              ? 'hover:border-grass-600 hover:bg-grass-600/35'
                              : 'hover:border-deck-600 hover:bg-deck-700'
                          }`}
                        >
                          {body}
                        </button>
                      ) : (
                        <div className={bubbleClass}>{body}</div>
                      )
                    const onlySession = e.sessionId && !e.streamItemId && !e.body && !e.filePath
                    const bubbleTipped = onlySession ? (
                      <Tip label="Resume in Ghostty (⌘+click to read it here)">{bubble}</Tip>
                    ) : (
                      bubble
                    )
                    return (
                      <li
                        // biome-ignore lint/suspicious/noArrayIndexKey: static snapshot list
                        key={i}
                        className={`flex items-start gap-2 ${e.mine ? 'flex-row-reverse' : ''} ${i === 0 ? '' : grouped ? 'mt-1' : 'mt-4'}`}
                      >
                        {grouped ? <span className="w-7 shrink-0" /> : <FeedAvatar avatar={e.avatar} name={name} />}
                        <div className={`flex max-w-[60%] min-w-0 flex-col ${e.mine ? 'items-end' : 'items-start'}`}>
                          {/* a reply always says what it answers, even inside a run from one person */}
                          {(!grouped || e.replyTo) && (
                            <span className="mb-0.5 flex items-center gap-1 text-[12px] leading-4 font-bold text-deck-400">
                              {e.replyTo && <ReplyIcon />}
                              {e.replyTo ? `Reply from ${name}` : name}
                            </span>
                          )}
                          {e.replyTo ? (
                            // the session this report answers sits behind it, like a card under a card:
                            // 20px further left, same right edge, peeking out on top, squarer, content grayed
                            <div className="grid">
                              <div className="rounded-xl border border-grass-700/40 bg-grass-700/15 px-3 pt-2 pb-5 text-xs text-deck-300">
                                {/* the bubble stays solid; only what it says is toned down */}
                                <span className="[filter:grayscale(70%)]">
                                  <IconBox name={e.replyTo.icon} small className="mr-0.5" /> {e.replyTo.text} ·{' '}
                                  {messageTime(e.replyTo.ts)}
                                </span>
                              </div>
                              {/* opaque underlay: the front bubble's tint is translucent and would show the back one */}
                              <div className="-mt-3 ml-[20px] rounded-[18px] bg-deck-950">{bubbleTipped}</div>
                            </div>
                          ) : (
                            bubbleTipped
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </div>

          <ChecksBox checks={checks} expanded={expandChecks} />
          {/* terminal sits on the chat input, capped so history always keeps room; each scrolls on its own */}
          <div className="flex shrink-0 flex-col gap-2 border-t border-deck-800 p-3">
            {(showRun || picked) && (
              <div className={termOpen ? 'flex max-h-[45vh] min-h-0 flex-col' : ''}>
                <TerminalWindow
                  label={picked ? pickedLabel : (run?.command ?? '')}
                  running={!picked && running}
                  open={termOpen}
                  onToggle={() => setTermOpen((o) => !o)}
                  onKill={onKill}
                  bodyRef={runRef}
                  onScroll={onRunScroll}
                >
                  {!picked ? (
                    <RunLog lines={run?.lines ?? []} onLink={openLink} />
                  ) : picked.lines === null ? (
                    <p className="text-deck-500">Loading {pickedLabel}…</p>
                  ) : picked.lines.length === 0 ? (
                    <p className="text-deck-500">
                      Inside {pickedLabel}. No output stored for it — a message sent here resumes it.
                    </p>
                  ) : (
                    <RunLog lines={picked.lines} onLink={openLink} />
                  )}
                </TerminalWindow>
              </div>
            )}
            <ReplyBox
              value={input}
              onChange={setInput}
              onSend={() => send(chatTo)}
              onCancel={onCancel}
              canReply={canReply}
              running={running}
              placeholder={chatPlaceholder}
              commands={commands}
              tools={
                !!task.repoPath && (
                  <SessionPicker
                    options={options}
                    selected={chatTo}
                    onSelect={setPick}
                    open={pickerOpen}
                    onOpenChange={setPickerOpen}
                  />
                )
              }
            />
          </div>

          {report && (
            <div className="absolute inset-0 z-30 flex flex-col bg-deck-900">
              <div className="flex items-center gap-2 border-b border-deck-800 px-4 py-2.5">
                <BackButton onClick={() => setReport(null)} title="Back to the PR panel" />
                <p className="min-w-0 flex-1 truncate font-mono text-xs text-deck-400">{report.title}</p>
              </div>
              <Markdown
                text={report.content}
                onLink={(url, external) => openPrWindow(url, task.repo, task.prNumber, external)}
                className="prose prose-sm prose-invert max-w-none flex-1 overflow-auto p-4 prose-headings:text-deck-100 prose-a:text-grass-300 prose-code:text-grass-300 prose-code:before:content-none prose-code:after:content-none prose-pre:bg-deck-800 prose-td:text-deck-200 prose-th:text-deck-300"
              />
              {/* "1,3" / "all" goes to the session that wrote the report */}
              {!!sessionId && (
                <div className="border-t border-deck-800 p-3">
                  <ReplyBox
                    value={input}
                    onChange={setInput}
                    onSend={() => send(sessionId ?? null)}
                    onCancel={onCancel}
                    canReply={canReply}
                    running={running}
                    placeholder='send comments from here — e.g. "1,3" or "all"'
                    commands={commands}
                    autoFocus
                  />
                </div>
              )}
            </div>
          )}
          {transcript && (
            <div className="absolute inset-0 z-30 flex flex-col bg-deck-900">
              <div className="flex items-center gap-2 border-b border-deck-800 px-4 py-2.5">
                <BackButton onClick={() => setTranscript(null)} title="Back to the PR panel" />
                <p className="min-w-0 flex-1 truncate font-mono text-xs text-deck-400">{transcript.title}</p>
                <Tip label="Resume this session in Ghostty">
                  <button
                    type="button"
                    onClick={() => resumeSession(transcript.id)}
                    className="shrink-0 cursor-pointer rounded border border-deck-600 px-2 py-0.5 text-xs text-deck-300 hover:bg-deck-800 hover:text-deck-100"
                  >
                    Resume in terminal
                  </button>
                </Tip>
              </div>
              <div className="flex min-h-0 flex-1 flex-col p-4">
                <TerminalWindow
                  label=""
                  running={transcriptRunning}
                  onKill={onKill}
                  bodyRef={transcriptBodyRef}
                  onScroll={onTranscriptScroll}
                  className="flex-1"
                >
                  {transcript.lines ? (
                    <RunLog lines={[...transcript.lines, ...transcriptTail]} onLink={openLink} />
                  ) : (
                    <p className="m-auto text-deck-500">Loading session…</p>
                  )}
                </TerminalWindow>
              </div>
              <div className="border-t border-deck-800 p-3">
                <ReplyBox
                  value={input}
                  onChange={setInput}
                  onSend={() => send(transcript.id)}
                  onCancel={onCancel}
                  canReply={!running && !!task.repoPath}
                  running={running}
                  placeholder="Message this session…"
                  commands={commands}
                  autoFocus
                />
              </div>
            </div>
          )}
          {confirm && <ConfirmDialog confirm={confirm} onClose={() => setConfirm(null)} />}
        </>
      )}
    </SidePanel>
  )
}
