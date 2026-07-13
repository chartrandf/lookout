import { writeText } from '@tauri-apps/plugin-clipboard-manager'
import { Command } from '@tauri-apps/plugin-shell'

// New Ghostty window in the repo, resuming the Claude session.
// Returns true if Ghostty launched; false = not installed (command copied to clipboard instead).
export const resumeInGhostty = async (repoPath: string, sessionId: string): Promise<boolean> => {
  const out = await Command.create('open', [
    '-na',
    'Ghostty.app',
    '--args',
    `--working-directory=${repoPath}`,
    '-e',
    'claude',
    '--resume',
    sessionId,
  ]).execute()
  if (out.code === 0) return true
  await writeText(`cd ${repoPath} && claude --resume ${sessionId}`)
  return false
}
