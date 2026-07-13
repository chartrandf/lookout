import { join } from '@tauri-apps/api/path'
import { exists, readDir } from '@tauri-apps/plugin-fs'

// Map branch -> review file paths (AI_TASKS/code-review/YYYY-MM-DD-HH-MM-<branch>.md)
export const scanReviewFiles = async (repoPath: string): Promise<Map<string, string[]>> => {
  const byBranch = new Map<string, string[]>()
  const dir = await join(repoPath, 'AI_TASKS', 'code-review')
  if (!(await exists(dir))) return byBranch
  const entries = await readDir(dir)
  for (const entry of entries) {
    const m = entry.name.match(/^\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-(.+)\.md$/)
    if (!entry.isFile || !m) continue
    const branch = m[1]
    const files = byBranch.get(branch) ?? []
    files.push(await join(dir, entry.name))
    byBranch.set(branch, files)
  }
  return byBranch
}
