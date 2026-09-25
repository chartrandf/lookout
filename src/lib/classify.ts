import { Command } from '@tauri-apps/plugin-shell'
import { errText, logWarn } from './log'
import type { CaptureKind } from './transcript'

// A button whose prompt opens with no known slash command (the shipped do-followup is plain text)
// leaves the transcript unable to say what the run was. Haiku reads the final turn and says.
// Only button runs get here — never the sync pass, which sees every session on the machine.
const MAX_INPUT = 8 * 1024 // the verdict and its shape are in the first few KB

const PROMPT = `Below is the final answer of a Claude Code session. Classify it with one word:
- review: a code review of a pull request (findings, verdict, requested changes)
- followup: a check of whether earlier review comments on a pull request were addressed
- none: anything else (debugging, a fix, a question, a short sign-off)
Answer with the word only.

<answer>
`

export const parseVerdict = (text: string): CaptureKind | null => {
  const word = text
    .trim()
    .toLowerCase()
    .replace(/[^a-z]/g, '')
  return word === 'review' || word === 'followup' ? word : null
}

// A session's final turn barely changes between replies; classify it once. Failures aren't kept,
// so a missing `claude` or a rate limit costs this capture and is retried on the next turn.
const verdicts = new Map<string, CaptureKind | null>() // session id -> verdict

export const classifySession = async (sessionId: string, body: string): Promise<CaptureKind | null> => {
  const known = verdicts.get(sessionId)
  if (known !== undefined) return known
  try {
    const out = await Command.create('claude', [
      '-p',
      `${PROMPT}${body.slice(0, MAX_INPUT)}\n</answer>`,
      '--model',
      'haiku',
      '--tools',
      '', // a classification needs no tools
      '--no-session-persistence', // or the classifier's own transcript would show up as a session
    ]).execute()
    if (out.code !== 0) {
      logWarn('classify', `${sessionId}: claude exited ${out.code}: ${out.stderr.trim()}`)
      return null
    }
    const verdict = parseVerdict(out.stdout)
    verdicts.set(sessionId, verdict)
    return verdict
  } catch (e) {
    logWarn('classify', `${sessionId}: ${errText(e)}`)
    return null
  }
}
