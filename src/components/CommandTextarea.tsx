import { type KeyboardEvent, type RefObject, useEffect, useRef, useState } from 'react'
import { droppedPaths, fileRefs, saveDroppedImages } from '../lib/filerefs'
import { fuzzyFilter } from '../lib/fuzzy'
import { errText, logWarn } from '../lib/log'

type Props = {
  value: string
  commands: string[] // command names without the leading slash
  // repo paths suggested on `@` (dirs end with `/`), fetched on the first `@`; none = no `@` menu
  loadFiles?: () => Promise<string[]>
  onChange: (v: string) => void
  onBlur?: () => void
  placeholder?: string
  rows?: number
  className?: string
  disabled?: boolean
  placeholders?: boolean // suggest the prompt placeholders on `<` (button prompts only)
  menuUp?: boolean // open the suggestions above, for a field at the bottom of the screen
  inputRef?: RefObject<HTMLTextAreaElement | null>
  onKeyDown?: (e: KeyboardEvent<HTMLTextAreaElement>) => void // keys the open menu didn't take
}

// prompt placeholders filled in at run time (see lib/prompt.ts)
const PLACEHOLDERS = ['pr_id', 'branch_name']

// `/name` (slash command), `@path` (file) or `<name` (placeholder) typed at the caret
const COMMAND_RE = /(^|\s)(\/[\w:-]*)$/
const FILE_RE = /(^|\s)(@[^\s@]*)$/
const PLACEHOLDER_RE = /(<[\w_]*)$/

type Menu = { kind: 'command' | 'file' | 'placeholder'; start: number; query: string }

// how each kind renders in the list and inserts into the text; a dir goes in without the space,
// so the menu stays open on its content
const render = (kind: Menu['kind'], name: string) =>
  kind === 'command' ? `/${name}` : kind === 'file' ? name : `<${name}>`
const insertText = (kind: Menu['kind'], name: string) =>
  kind === 'command' ? `/${name} ` : kind === 'file' ? `@${name}${name.endsWith('/') ? '' : ' '}` : `<${name}>`

const detect = (el: HTMLTextAreaElement, placeholders: boolean, files: boolean): Menu | null => {
  const before = el.value.slice(0, el.selectionStart ?? 0)
  const cmd = before.match(COMMAND_RE)
  if (cmd) return { kind: 'command', start: before.length - cmd[2].length, query: cmd[2].slice(1) }
  const file = files ? before.match(FILE_RE) : null
  if (file) return { kind: 'file', start: before.length - file[2].length, query: file[2].slice(1) }
  if (!placeholders) return null
  const ph = before.match(PLACEHOLDER_RE)
  if (ph) return { kind: 'placeholder', start: before.length - ph[1].length, query: ph[1].slice(1) }
  return null
}

// Textarea that suggests the user's Claude slash-commands while typing `/…`, the repo's files
// (fuzzy, like claude and opencode) while typing `@…` and the prompt placeholders while typing `<…`. Arrow keys navigate, Enter/Tab inserts, Esc dismisses.
export const CommandTextarea = ({
  value,
  commands,
  loadFiles,
  onChange,
  onBlur,
  placeholder,
  rows = 3,
  className,
  disabled,
  placeholders = true,
  menuUp,
  inputRef,
  onKeyDown,
}: Props) => {
  const own = useRef<HTMLTextAreaElement>(null)
  const ref = inputRef ?? own
  const [menu, setMenu] = useState<Menu | null>(null)
  const [active, setActive] = useState(0)
  const [files, setFiles] = useState<string[] | null>(null) // null = not fetched yet
  const fetching = useRef(false)
  const listRef = useRef<HTMLUListElement>(null)

  // another repo: fetch its files on its own first `@`
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset trigger only
  useEffect(() => {
    setFiles(null)
    fetching.current = false
  }, [loadFiles])

  const q = menu?.query.toLowerCase() ?? ''
  const suggestions = !menu
    ? []
    : menu.kind === 'file'
      ? fuzzyFilter(menu.query, files ?? [], 50)
      : (menu.kind === 'command' ? commands : PLACEHOLDERS)
          .filter((c) => c.toLowerCase().includes(q))
          .sort((a, b) => Number(b.toLowerCase().startsWith(q)) - Number(a.toLowerCase().startsWith(q)))
          .slice(0, 8)
  const open = suggestions.length > 0

  // keep the highlighted suggestion visible when navigating with the arrows
  useEffect(() => {
    const list = listRef.current
    const el = list?.querySelector<HTMLElement>('[data-active="true"]')
    if (!list || !el) return
    const top = el.offsetTop
    const bottom = top + el.offsetHeight
    if (top < list.scrollTop) list.scrollTop = top
    else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight
  }, [active, suggestions])

  const refresh = (el: HTMLTextAreaElement) => {
    const next = detect(el, placeholders, !!loadFiles)
    setMenu(next)
    setActive(0)
    if (next?.kind === 'file' && loadFiles && !files && !fetching.current) {
      fetching.current = true
      loadFiles()
        .then(setFiles)
        .catch(() => setFiles([]))
    }
  }

  const choose = (name: string) => {
    const el = ref.current
    if (!el || !menu) return
    const inserted = insertText(menu.kind, name)
    const next = value.slice(0, menu.start) + inserted + value.slice(el.selectionStart ?? 0)
    onChange(next)
    setMenu(menu.kind === 'file' && name.endsWith('/') ? { ...menu, query: name } : null)
    setActive(0)
    const pos = menu.start + inserted.length
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(pos, pos)
    })
  }

  return (
    <div className="relative">
      <textarea
        ref={ref}
        value={value}
        rows={rows}
        onChange={(e) => {
          onChange(e.target.value)
          refresh(e.target)
        }}
        onClick={(e) => refresh(e.currentTarget)}
        // a dropped file goes in as `@path` at the caret, not the bare path the webview would paste;
        // a path-less image (screenshot thumbnail) is saved first, then referenced the same way
        onDrop={async (e) => {
          const paths = droppedPaths(e.dataTransfer.getData('text/uri-list'), e.dataTransfer.getData('text/plain'))
          const files = paths.length === 0 ? [...e.dataTransfer.files] : []
          if (paths.length === 0 && !files.some((f) => f.type.startsWith('image/'))) return
          e.preventDefault()
          const el = e.currentTarget
          if (files.length > 0) {
            try {
              paths.push(...(await saveDroppedImages(files)))
            } catch (err) {
              logWarn('chat', `dropped image not saved: ${errText(err)}`)
              return
            }
          }
          const at = el.selectionStart ?? value.length
          const inserted = fileRefs(paths, value.slice(0, at))
          onChange(value.slice(0, at) + inserted + value.slice(el.selectionEnd ?? at))
          const pos = at + inserted.length
          requestAnimationFrame(() => {
            el.focus()
            el.setSelectionRange(pos, pos)
          })
        }}
        onKeyUp={(e) => {
          if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) refresh(e.currentTarget)
        }}
        onKeyDown={(e) => {
          if (!open) return onKeyDown?.(e)
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setActive((i) => (i + 1) % suggestions.length)
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActive((i) => (i - 1 + suggestions.length) % suggestions.length)
          } else if (e.key === 'Enter' || e.key === 'Tab') {
            e.preventDefault()
            choose(suggestions[active] ?? suggestions[0])
          } else if (e.key === 'Escape') {
            e.preventDefault()
            e.stopPropagation() // keep the side panel open — just dismiss the menu
            setMenu(null)
          }
        }}
        onBlur={() => {
          setTimeout(() => setMenu(null), 120) // let a suggestion click register first
          onBlur?.()
        }}
        placeholder={placeholder}
        disabled={disabled}
        className={className}
      />
      {open && menu && (
        <ul
          ref={listRef}
          className={`absolute inset-x-0 z-40 max-h-56 ${menuUp ? 'bottom-full mb-1' : 'top-full mt-1'} overflow-y-auto overflow-x-hidden rounded-md border border-deck-700 bg-deck-800 py-1 shadow-xl`}
        >
          {suggestions.map((name, i) => (
            <li key={name} data-active={i === active}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault()
                  choose(name)
                }}
                onMouseEnter={() => setActive(i)}
                className={`flex w-full cursor-pointer items-center px-3 py-1.5 text-left font-mono text-xs ${
                  i === active ? 'bg-grass-600/25 text-grass-100' : 'text-deck-200 hover:bg-deck-700'
                }`}
              >
                <span className="truncate">{render(menu.kind, name)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
