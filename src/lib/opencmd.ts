import { homeDir, join } from '@tauri-apps/api/path'
import { exists, readDir, readTextFile } from '@tauri-apps/plugin-fs'
import { splitFrontmatter } from './skills'

// opencode v2 dropped `opencode run --command`: a `/name args` prompt has to be expanded before the
// run. v2 discovers commands as `{command,commands}/**/*.md` under its config roots — which include
// the Claude dirs — and expands `$ARGUMENTS` and positional `$N` in the template. This mirrors that
// (minus `!`shell`` interpolation and the frontmatter agent/model, which stay literal), so Lookout
// dispatches the same prompt the TUI would.

// roots v2 scans, user ones first so a user command wins over a repo's, matching skills.ts
const rootsFor = async (cwd: string): Promise<string[]> => {
  const home = await homeDir()
  return [
    await join(home, '.claude'),
    await join(home, '.config', 'opencode'),
    await join(home, '.agents'),
    await join(cwd, '.claude'),
    await join(cwd, '.opencode'),
    await join(cwd, '.agents'),
  ]
}

// command name from the path under the root: `commands/review.md` is `review`, a subdir nests
export const commandName = (rel: string) => rel.replace(/^(command|commands)\//, '').replace(/\.md$/, '')

// every markdown command under `<root>/command` and `<root>/commands`, as [name, template]
const scanCommands = async (root: string): Promise<[string, string][]> => {
  const walk = async (dir: string, rel: string): Promise<[string, string][]> => {
    if (!(await exists(dir).catch(() => false))) return []
    const out: [string, string][] = []
    for (const entry of await readDir(dir).catch(() => [])) {
      const sub = rel ? `${rel}/${entry.name}` : entry.name
      if (entry.isDirectory) out.push(...(await walk(await join(dir, entry.name), sub)))
      else if (entry.name.endsWith('.md')) {
        const md = await readTextFile(await join(dir, entry.name)).catch(() => '')
        out.push([commandName(rel), splitFrontmatter(md).body.trim()])
      }
    }
    return out
  }
  const dirs = await Promise.all(
    ['command', 'commands'].map((d) => join(root, d).then((dir) => walk(dir, d))),
  )
  return dirs.flat()
}

// prompt arguments split the way v2 splits them: quoted strings stay one argument
const argsRegex = /(?:\[Image\s+\d+\]|"[^"]*"|'[^']*'|[^\s"']+)/g
const placeholderRegex = /\$([1-9]\d*)/g
const argumentRegex = /\$(?:ARGUMENTS|([1-9]\d*))/g

// v2's template expansion: $ARGUMENTS takes the whole input, $N the Nth argument (the highest
// placeholder takes everything from its position on), and an input without any placeholder in the
// template is appended after it
export const expandTemplate = (template: string, input: string): string => {
  const args = (input.match(argsRegex) ?? []).map((a) => a.replace(/^["']|["']$/g, ''))
  const placeholders = template.match(placeholderRegex) ?? []
  const last = Math.max(0, ...placeholders.map((p) => Number(p.slice(1))))
  const withArgs = template.replace(argumentRegex, (match, index?: string) => {
    if (match === '$ARGUMENTS') return input
    const pos = Number(index)
    const i = pos - 1
    if (i >= args.length) return ''
    if (pos === last) return args.slice(i).join(' ')
    return args[i]
  })
  return placeholders.length === 0 && !template.includes('$ARGUMENTS') && input.trim()
    ? `${withArgs}\n\n${input}`.trim()
    : withArgs.trim()
}

// the expanded prompt for a `/command args`, or null when no template defines it
export const resolveOcCommand = async (command: string, args: string, cwd: string): Promise<string | null> => {
  const roots = await rootsFor(cwd)
  const lists = await Promise.all(roots.map((root) => scanCommands(root)))
  for (const [name, template] of lists.flat()) if (name === command) return expandTemplate(template, args)
  return null
}
