import { parseStage, STAGE_LABEL, STAGES } from '../lib/stages'
import type { ReviewTask, Stage } from '../types'
import { type Args, flagNumber, flagString, parseArgs } from './args'
import { type Db, NoDatabaseError, openDb } from './db'
import { notifyApp } from './notify'
import { resolveDbPath } from './paths'
import { AmbiguousError, NoMatchError, resolveCard, type Selector } from './resolve'

// Exit codes are the CLI's contract with skills: 2 and 3 mean "nothing to do here", not failure.
export const EXIT = { ok: 0, error: 1, noMatch: 2, noDb: 3, ambiguous: 4 } as const

// What a stage looks like when typed: the board's own name, dash-joined. `inbox` and the other
// stored ids still work — parseStage takes either — but the help shows what the UI shows.
const STAGE_NAMES = STAGES.map((s) => s.label.toLowerCase().replace(/ /g, '-'))

const readStage = (input: string): Stage => {
  const stage = parseStage(input)
  if (!stage) throw new Error(`unknown stage "${input}" — expected one of: ${STAGE_NAMES.join(', ')}`)
  return stage
}

// `lookout card reviewed` and friends — sugar for `card stage <stage>`.
const VERB_STAGE: Record<string, Stage> = {
  reviewed: 'reviewed',
  'follow-up': 'followup',
  followup: 'followup',
  done: 'done',
  watch: 'watching',
  ignore: 'ignored',
}

const USAGE = `lookout — move Lookout review cards from the terminal

  lookout card list [--stage <s>] [--repo <r>]
  lookout card show [selector]
  lookout card stage <${STAGE_NAMES.join(' | ')}> [selector] [--force]
  lookout card reviewed | follow-up | done | watch | ignore [selector]
  lookout card comments-pushed [selector] --count <n> [--numbers 1,3] [--url <u>]
  lookout doctor

selector   --card <id> | --pr <n> | --branch <b> [--repo <owner/repo>]
           defaults to the PR for the current repo + branch
options    --json   machine-readable output
           --quiet  print nothing (exit code only)
           --dry-run  resolve and report, write nothing
`

type Ctx = {
  args: Args
  json: boolean
  quiet: boolean
  dryRun: boolean
  out: (human: string, data: unknown) => void
}

const selectorFrom = (args: Args): Selector => ({
  card: flagString(args.flags, 'card'),
  pr: flagNumber(args.flags, 'pr'),
  branch: flagString(args.flags, 'branch'),
  repo: flagString(args.flags, 'repo'),
})

const line = (t: ReviewTask): string => `${t.id.padEnd(34)} ${STAGE_LABEL[t.stage].padEnd(13)} ${t.branch}`

const cardJson = (t: ReviewTask) => ({
  id: t.id,
  repo: t.repo,
  repo_path: t.repoPath,
  branch: t.branch,
  pr_number: t.prNumber,
  pr_url: t.prUrl,
  pr_state: t.prState,
  stage: t.stage,
  stage_label: STAGE_LABEL[t.stage],
})

// A stage move, shared by `card stage` and every sugar verb.
const moveStage = (db: Db, ctx: Ctx, target: Stage, extra?: (id: string) => void): number => {
  const card = resolveCard(db, selectorFrom(ctx.args))
  if (ctx.dryRun) {
    ctx.out(`would move ${card.id}: ${STAGE_LABEL[card.stage]} → ${STAGE_LABEL[target]}`, {
      ...cardJson(card),
      would_move_to: target,
      dry_run: true,
    })
    return EXIT.ok
  }
  const move = db.setStage(card.id, target, ctx.args.flags.force === true || ctx.args.flags.force === 'true')
  extra?.(card.id)
  const human = move.changed
    ? `${card.id}: ${STAGE_LABEL[move.from]} → ${STAGE_LABEL[move.to]}`
    : `${card.id}: already ${STAGE_LABEL[move.to]} (no change)`
  ctx.out(human, { ...cardJson(card), stage: move.to, stage_label: STAGE_LABEL[move.to], moved: move.changed })
  if (move.changed) notifyApp({ kind: 'cards.changed', ids: [card.id], source: 'cli' })
  return EXIT.ok
}

const cardCommand = (db: Db, ctx: Ctx): number => {
  const [, sub, arg] = ctx.args.path

  if (!sub || sub === 'list') {
    const asked = flagString(ctx.args.flags, 'stage')
    const stage = asked === undefined ? undefined : readStage(asked)
    const tasks = db.tasks({ stage, repo: flagString(ctx.args.flags, 'repo') })
    ctx.out(tasks.map(line).join('\n') || '(no cards)', tasks.map(cardJson))
    return EXIT.ok
  }

  if (sub === 'show') {
    const card = resolveCard(db, selectorFrom(ctx.args))
    const human = [
      `${card.id}  ${card.prUrl}`,
      `stage      ${STAGE_LABEL[card.stage]}`,
      `branch     ${card.branch}`,
      `pr state   ${card.prState}${card.isDraft ? ' (draft)' : ''}`,
      `ci         ${card.ciState ?? 'none'}`,
      `sessions   ${card.sessionIds.length}`,
      `reports    ${card.reviewFiles.length}`,
    ].join('\n')
    ctx.out(human, cardJson(card))
    return EXIT.ok
  }

  if (sub === 'stage') {
    if (!arg) throw new Error(`stage required: one of ${STAGE_NAMES.join(', ')}`)
    return moveStage(db, ctx, readStage(arg))
  }

  if (VERB_STAGE[sub]) return moveStage(db, ctx, VERB_STAGE[sub])

  // What /do-review calls once the comments are on GitHub: says what happened, lets the CLI pick
  // the stage. Acting on a card also means I've seen it, so the unread markers clear.
  if (sub === 'comments-pushed') {
    const count = flagNumber(ctx.args.flags, 'count')
    if (count === undefined) throw new Error('--count <n> required')
    return moveStage(db, ctx, 'reviewed', (id) => {
      if (count > 0) {
        db.setSeen(id, true)
        db.clearNewActivity(id)
      }
    })
  }

  throw new Error(`unknown card command "${sub}"`)
}

const doctor = (ctx: Ctx): number => {
  const path = resolveDbPath()
  try {
    const db = openDb(path, true)
    const tasks = db.tasks()
    db.close()
    ctx.out(`database  ${path}\ncards     ${tasks.length}`, { db: path, cards: tasks.length, ok: true })
    return EXIT.ok
  } catch (e) {
    if (e instanceof NoDatabaseError) {
      ctx.out(`database  ${path}\nstatus    not found — start Lookout once first`, {
        db: path,
        ok: false,
        error: String(e.message),
      })
      return EXIT.noDb
    }
    throw e
  }
}

export const run = (argv: string[], stdout = console.log, stderr = console.error): number => {
  const args = parseArgs(argv)
  const json = args.flags.json === true || args.flags.json === 'true'
  const quiet = args.flags.quiet === true || args.flags.quiet === 'true'
  const ctx: Ctx = {
    args,
    json,
    quiet,
    dryRun: args.flags['dry-run'] === true || args.flags['dry-run'] === 'true',
    out: (human, data) => {
      if (quiet) return
      stdout(json ? JSON.stringify(data, null, 2) : human)
    },
  }

  const [command] = args.path
  if (!command || command === 'help' || args.flags.help) {
    stdout(USAGE)
    return EXIT.ok
  }

  try {
    if (command === 'doctor') return doctor(ctx)
    if (command !== 'card') throw new Error(`unknown command "${command}"`)
    const readOnly = ['list', 'show', undefined].includes(args.path[1]) || ctx.dryRun
    const db = openDb(resolveDbPath(), readOnly)
    try {
      return cardCommand(db, ctx)
    } finally {
      db.close()
    }
  } catch (e) {
    if (e instanceof NoDatabaseError) {
      if (!quiet) stderr(String(e.message))
      return EXIT.noDb
    }
    if (e instanceof NoMatchError) {
      if (!quiet) stderr(String(e.message))
      return EXIT.noMatch
    }
    if (e instanceof AmbiguousError) {
      if (!quiet) stderr([e.message, ...e.matches.map((m) => `  ${m.id}  ${m.branch}`)].join('\n'))
      return EXIT.ambiguous
    }
    if (!quiet) stderr(e instanceof Error ? e.message : String(e))
    return EXIT.error
  }
}
