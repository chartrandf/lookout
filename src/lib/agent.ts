import { type Child, Command } from '@tauri-apps/plugin-shell'
import { REVIEW_TOOLS, type StreamEvent, spawnClaude } from './claude'
import { toolDetail } from './transcript'

// Which coding-agent CLI Lookout drives (Settings → Agent). Claude Code by default; opencode as the
// alternative. Every agent call goes through here: the one-shot asks (classify, rate, guess, check)
// and the streamed runs behind the action buttons and the Stream board.
export type AgentCli = 'claude' | 'opencode'

// fast: the background asks (classify, rate, guess, check); strong: a watcher set to Strong and the
// release notes; work: the action buttons and Stream cards; default: no --model, the CLI's own model.
export type ModelTier = 'fast' | 'strong' | 'work' | 'default'
export type PickedTier = Exclude<ModelTier, 'default'>

export type AgentSettings = {
  cli: AgentCli
  // empty = the tier's default for the CLI (DEFAULT_MODELS), else the CLI's own configured model
  fastModel: string
  strongModel: string
  workModel: string
}

export const DEFAULT_AGENT: AgentSettings = { cli: 'claude', fastModel: '', strongModel: '', workModel: '' }

export const AGENT_CLIS: { value: AgentCli; label: string }[] = [
  { value: 'claude', label: 'Claude Code' },
  { value: 'opencode', label: 'opencode' },
]

// stored settings back to settings (a hand-edited config can't break every agent call)
export const readAgent = (v: unknown): AgentSettings => {
  const o = (v ?? {}) as Partial<AgentSettings>
  const str = (s: unknown) => (typeof s === 'string' ? s.trim() : '')
  return {
    cli: o.cli === 'opencode' ? 'opencode' : 'claude',
    fastModel: str(o.fastModel),
    strongModel: str(o.strongModel),
    workModel: str(o.workModel),
  }
}

// Claude Code has no command that lists models: these are the aliases `claude --help` documents,
// each the latest model of its family
export const CLAUDE_ALIASES = ['haiku', 'sonnet', 'opus', 'fable']

// What an empty model field runs on. Claude: Haiku for the cheap asks, Sonnet for the harder checks,
// and its own default model for real work. opencode's free models come and go, so each tier is a
// preference list and the first one `opencode models` still lists wins. Picked 2026-10-23 by timing
// a priority rating on the free models: mimo-v2.6-flash gave the cleanest JSON in 4.5 s (deepseek
// v4.1 flash: good, 6.7 s; nemotron lightning: faster, but echoed the titles as reasons), and
// big-pickle for heavy work.
const DEFAULT_MODELS: Record<AgentCli, Record<PickedTier, string[]>> = {
  claude: { fast: ['haiku'], strong: ['sonnet'], work: [] },
  opencode: {
    fast: ['opencode/mimo-v2.6-flash-free', 'opencode/deepseek-v4.1-flash-free'],
    strong: ['opencode/big-pickle'],
    work: ['opencode/big-pickle'],
  },
}

// `opencode models` prints one provider/model per line: what its configured providers serve
export const parseOpencodeModels = (stdout: string) =>
  stdout
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^[\w.-]+\/\S+$/.test(l))

// asked once per app run; a failed or empty answer is asked again next time
let opencodeModels: string[] | null = null // the last listing, for the defaults
const listed = new Map<AgentCli, Promise<string[]>>()
export const listModels = (cli: AgentCli): Promise<string[]> => {
  if (cli === 'claude') return Promise.resolve(CLAUDE_ALIASES)
  const known = listed.get(cli)
  if (known) return known
  const asked = Command.create('opencode', ['models'])
    .execute()
    .then((out) => (out.code === 0 ? parseOpencodeModels(out.stdout) : []))
    .catch(() => [])
    .then((models) => {
      if (models.length) opencodeModels = models
      else listed.delete(cli)
      return models
    })
  listed.set(cli, asked)
  return asked
}

// the model an empty field runs on, or null for the CLI's own configured model
export const defaultModel = (
  tier: PickedTier,
  cli: AgentCli,
  models: string[] | null = cli === 'claude' ? CLAUDE_ALIASES : opencodeModels,
): string | null => DEFAULT_MODELS[cli][tier].find((m) => models?.includes(m)) ?? null

// Set from the config at startup and on every save, like the log switch: the next call follows it.
// On opencode the listing starts right away, so the defaults are known by the first call.
let current: AgentSettings = DEFAULT_AGENT
export const setAgent = (a: AgentSettings) => {
  current = a
  if (a.cli === 'opencode') listModels('opencode')
}
export const getAgent = () => current

// the binary's name, for messages and the terminal title (`$ claude`, `$ opencode`)
export const agentBin = () => current.cli

const picked = (tier: PickedTier, a: AgentSettings) =>
  ({ fast: a.fastModel, strong: a.strongModel, work: a.workModel })[tier]

// the --model value for a tier, or null to leave the CLI on its own default
export const modelFor = (tier: ModelTier, a: AgentSettings = current): string | null =>
  tier === 'default' ? null : picked(tier, a) || defaultModel(tier, a.cli)

// What a tier runs on, for the UI: the picked model, the tier's default, or the CLI's own
export const tierLabel = (tier: PickedTier, a: AgentSettings = current) =>
  modelFor(tier, a) ?? (a.cli === 'claude' ? "Claude Code's default" : 'opencode default')

// Claude Code tool names → opencode permission keys. Anything else (an unknown tool) is dropped:
// opencode starts from deny-all, so a tool it can't name stays denied.
const OPENCODE_TOOLS: Record<string, string> = {
  Read: 'read',
  Edit: 'edit',
  Write: 'edit',
  MultiEdit: 'edit',
  NotebookEdit: 'edit',
  Glob: 'glob',
  Grep: 'grep',
  LS: 'list',
  Task: 'task',
  TodoWrite: 'todowrite',
  Skill: 'skill',
  WebFetch: 'webfetch',
  WebSearch: 'websearch',
}

type Rule = 'allow' | 'deny'
type Permission = Record<string, Rule | Record<string, Rule>>

// Translate a Claude Code allow/deny list (`Bash(gh:*),Read,mcp__sentry__*`) into opencode's
// permission config, so a read-only shaping turn stays read-only on opencode too. Deny-all first,
// then the allows, then the denies: opencode's last matching rule wins.
export const opencodePermission = (allowed: string, denied = ''): Permission => {
  const perm: Permission = { '*': 'deny' }
  const bash: Record<string, Rule> = { '*': 'deny' }
  const apply = (list: string, rule: Rule) => {
    for (const raw of list.split(',')) {
      const t = raw.trim()
      if (!t) continue
      const cmd = /^Bash\((.+)\)$/.exec(t)?.[1]
      if (cmd) bash[cmd.replace(/:\*$/, ' *')] = rule
      else if (t === 'Bash') bash['*'] = rule
      else if (t.startsWith('mcp__')) perm[t.slice(5).replace('__', '_')] = rule
      else if (OPENCODE_TOOLS[t]) perm[OPENCODE_TOOLS[t]] = rule
    }
  }
  apply(allowed, 'allow')
  apply(denied, 'deny')
  if (Object.keys(bash).length > 1 || bash['*'] === 'allow') perm.bash = bash
  return perm
}

// opencode `run --format json` events → the StreamEvents Claude's stream-json gives. Each line is
// {type, sessionID, part}: text and tool_use parts as they finish, a step_finish per model turn
// (reason "tool-calls" mid-run, anything else = the answer is in), error on an API/auth failure.
export const opencodeParser = (onEvent: (e: StreamEvent) => void) => {
  let session: string | null = null
  let answer = '' // the text since the last step started: the final step's is the run's result
  return (line: string) => {
    if (!line.trim()) return
    // biome-ignore lint/suspicious/noExplicitAny: untyped opencode event
    let msg: any
    try {
      msg = JSON.parse(line)
    } catch {
      return
    }
    if (!session && typeof msg.sessionID === 'string') {
      session = msg.sessionID
      onEvent({ type: 'init', sessionId: msg.sessionID })
    }
    const part = msg.part ?? {}
    if (msg.type === 'step_start') answer = ''
    else if (msg.type === 'text' && part.text) {
      answer = answer ? `${answer}\n\n${part.text}` : part.text
      onEvent({ type: 'text', text: part.text })
    } else if (msg.type === 'tool_use')
      onEvent({ type: 'tool', name: part.tool ?? '', detail: part.state?.title ?? toolDetail(part.state?.input ?? {}) })
    else if (msg.type === 'step_finish' && part.reason !== 'tool-calls')
      onEvent({ type: 'result', text: answer, isError: false })
    else if (msg.type === 'error')
      onEvent({ type: 'result', text: msg.error?.data?.message ?? msg.error?.name ?? 'opencode failed', isError: true })
  }
}

// opencode has no slash-command syntax in a message: `/review 12` is `--command review` with "12"
const splitCommand = (prompt: string): { command: string; message: string } => {
  const m = /^\/([\w.:-]+)(?:\s+([\s\S]*))?$/.exec(prompt.trim())
  return m ? { command: m[1], message: m[2] ?? '' } : { command: '', message: prompt }
}

// `opencode run` reads stdin to the end before it starts, and a spawned child's stdin stays open, so
// it is started through sh with stdin on /dev/null. The script and its four slots (session, model,
// command, message) are pinned in the shell capability; an empty slot adds no flag.
export const OPENCODE_RUN_SCRIPT =
  // biome-ignore lint/suspicious/noTemplateCurlyInString: sh parameter expansion, not a template
  'exec opencode run --format json ${1:+--session "$1"} ${2:+--model "$2"} ${3:+--command "$3"} "$4" </dev/null'

const opencodeEnv = (allowed: string, denied?: string) => ({
  OPENCODE_PERMISSION: JSON.stringify(opencodePermission(allowed, denied)),
})

export type AskOptions = {
  tier?: ModelTier // default fast
  allowedTools?: string // unset = no tools at all (a classification, a rating)
  disallowedTools?: string
  cwd?: string
}

// A one-shot question: prompt in, final answer text out, no session left behind. Never throws on
// a failed answer: code/stderr say what went wrong, the caller logs and falls back.
export const askAgent = async (
  prompt: string,
  { tier = 'fast', allowedTools, disallowedTools, cwd }: AskOptions = {},
): Promise<{ code: number | null; stdout: string; stderr: string }> => {
  const model = modelFor(tier)
  if (current.cli === 'claude') {
    const out = await Command.create(
      'claude',
      [
        '-p',
        prompt,
        ...(model ? ['--model', model] : []),
        ...(allowedTools === undefined
          ? ['--tools', ''] // no tools at all
          : ['--allowedTools', allowedTools, ...(disallowedTools ? ['--disallowedTools', disallowedTools] : [])]),
        '--no-session-persistence', // or the asker's own transcript would show up as a session
      ],
      cwd ? { cwd } : undefined,
    ).execute()
    return { code: out.code, stdout: out.stdout ?? '', stderr: out.stderr ?? '' }
  }
  // execute() gives the child a closed stdin, so opencode needs no sh wrapper here
  const out = await Command.create(
    'opencode',
    ['run', '--format', 'json', ...(model ? ['--model', model] : []), prompt],
    {
      ...(cwd ? { cwd } : {}),
      // no tools still keeps read: opencode's free tier answers 403 ("only from within OpenCode") to a
      // request with every tool denied, and reading can't change anything
      env: opencodeEnv(allowedTools ?? 'Read', disallowedTools),
    },
  ).execute()
  let result: { text: string; isError: boolean } | null = null
  const parse = opencodeParser((e) => {
    if (e.type === 'result') result = e
  })
  for (const line of (out.stdout ?? '').split('\n')) parse(line)
  const r = result as { text: string; isError: boolean } | null
  if (r?.isError) return { code: out.code || 1, stdout: '', stderr: r.text }
  return { code: out.code, stdout: r?.text ?? '', stderr: out.stderr ?? '' }
}

// A streamed run (action buttons, Stream cards), resumable by its session id
export const spawnAgent = async (
  prompt: string,
  cwd: string,
  onEvent: (e: StreamEvent) => void,
  resumeSessionId?: string,
  allowedTools: string = REVIEW_TOOLS,
  disallowedTools?: string,
): Promise<Child> => {
  const model = modelFor('work')
  if (current.cli === 'claude')
    return spawnClaude(prompt, cwd, onEvent, resumeSessionId, allowedTools, disallowedTools, model ?? undefined)
  const { command, message } = splitCommand(prompt)
  const cmd = Command.create(
    'opencode-run',
    ['-c', OPENCODE_RUN_SCRIPT, 'sh', resumeSessionId ?? '', model ?? '', command, message],
    { cwd, env: opencodeEnv(allowedTools, disallowedTools) },
  )
  cmd.stdout.on('data', opencodeParser(onEvent))
  cmd.stderr.on('data', (line: string) => onEvent({ type: 'stderr', text: line }))
  cmd.on('close', (payload: { code: number | null }) => onEvent({ type: 'exit', code: payload.code }))
  cmd.on('error', (err: string) => {
    onEvent({ type: 'stderr', text: err })
    onEvent({ type: 'exit', code: -1 })
  })
  return cmd.spawn()
}

// the command line that resumes a session in a terminal
export const resumeArgs = (sessionId: string) =>
  current.cli === 'claude' ? ['claude', '--resume', sessionId] : ['opencode', '--session', sessionId]
