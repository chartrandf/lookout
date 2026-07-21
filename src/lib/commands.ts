import { homeDir, join } from '@tauri-apps/api/path'
import { exists, readDir } from '@tauri-apps/plugin-fs'

// Slash commands are `.md` files under a `commands` dir. A top-level file `foo.md` is `/foo`;
// a file in a subdir `ns/foo.md` is the namespaced `/ns:foo` (one level, matching Claude Code).
const scanCommandsDir = async (dir: string): Promise<string[]> => {
  if (!(await exists(dir).catch(() => false))) return []
  const names: string[] = []
  for (const entry of await readDir(dir).catch(() => [])) {
    if (entry.isFile && entry.name.endsWith('.md')) names.push(entry.name.replace(/\.md$/, ''))
    else if (entry.isDirectory) {
      const sub = await join(dir, entry.name)
      for (const child of await readDir(sub).catch(() => [])) {
        if (child.isFile && child.name.endsWith('.md')) names.push(`${entry.name}:${child.name.replace(/\.md$/, '')}`)
      }
    }
  }
  return names
}

// User commands (~/.claude/commands) plus each watched repo's project commands (.claude/commands),
// de-duplicated and sorted. Names carry no leading slash — the editor prepends it.
export const listSlashCommands = async (repoPaths: string[]): Promise<string[]> => {
  const home = await homeDir()
  const dirs = [
    await join(home, '.claude', 'commands'),
    ...(await Promise.all(repoPaths.map((p) => join(p, '.claude', 'commands')))),
  ]
  const lists = await Promise.all(dirs.map(scanCommandsDir))
  return [...new Set(lists.flat())].sort()
}
