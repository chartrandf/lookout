import { Command } from '@tauri-apps/plugin-shell'

// What the chat's `@` picker offers: the repo's files (tracked, plus untracked ones git doesn't
// ignore) and the directories holding them, as paths relative to the checkout.

const depth = (p: string) => p.replace(/\/$/, '').split('/').length

// `git ls-files` output → files and their parent dirs (`dir/`), shallowest first, then by name
export const pickerEntries = (out: string): string[] => {
  const entries = new Set<string>()
  for (const file of out.split('\n')) {
    if (!file) continue
    const parts = file.split('/')
    for (let i = 1; i < parts.length; i++) entries.add(`${parts.slice(0, i).join('/')}/`)
    entries.add(file)
  }
  return [...entries].sort((a, b) => depth(a) - depth(b) || a.localeCompare(b))
}

export const listRepoFiles = async (cwd: string): Promise<string[]> => {
  const out = await Command.create('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
    cwd,
  }).execute()
  return out.code === 0 ? pickerEntries(out.stdout) : []
}
