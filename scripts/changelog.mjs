// CHANGELOG.md from conventional commits: short, user-facing lines only (like the shortlog skill).
// Pure helpers, used by release.mjs.

const KINDS = ['major', 'minor', 'patch']

export const bumpVersion = (version, kind) => {
  const parts = version.split('.').map(Number)
  if (parts.length !== 3 || parts.some(Number.isNaN)) throw new Error(`not a x.y.z version: ${version}`)
  const i = KINDS.indexOf(kind)
  if (i < 0) throw new Error(`bump must be one of ${KINDS.join(', ')}: ${kind}`)
  return parts.map((n, j) => (j < i ? n : j === i ? n + 1 : 0)).join('.')
}

// commit type -> changelog tag; anything else (chore, refactor, ci, test, docs…) stays out
const TAGS = { feat: 'NEW', perf: 'ENHANCED', fix: 'FIX' }
const ORDER = ['NEW', 'ENHANCED', 'FIX']
const SUBJECT = /^(\w+)(?:\([^)]*\))?!?:\s*(.+)$/

const entry = (subject) => {
  const m = subject.match(SUBJECT)
  const tag = m && TAGS[m[1]]
  return tag ? { tag, text: m[2][0].toUpperCase() + m[2].slice(1) } : null
}

// one line per commit: the fallback when no summary could be made
export const commitLines = (subjects) => {
  const entries = subjects.map(entry).filter(Boolean)
  return ORDER.flatMap((tag) => entries.filter((e) => e.tag === tag).map((e) => `- [${tag}] ${e.text}`))
}

export const renderSection = (version, date, lines) =>
  [`## v${version} — ${date}`, '', ...(lines.length ? lines : ['- Internal changes only'])].join('\n')

// What Claude is asked, so a release reads as a few themes rather than its commit list
export const summaryPrompt = (subjects) =>
  [
    'Summarize these git commit subjects into a short, user-facing changelog for an app release.',
    'Rules:',
    '- Combine commits about the same subject or feature into ONE generic line.',
    '- At most 6 lines, each at most 12 words, plain text, no markdown or backticks.',
    '- Each line: `- [NEW] text`, `- [ENHANCED] text` or `- [FIX] text`; NEW first, then ENHANCED, then FIX.',
    '- Leave out chores, refactors, CI, tests, docs and anything users cannot see.',
    '- If nothing is user-facing, output nothing.',
    'Output only the lines.',
    '',
    ...subjects,
  ].join('\n')

// Claude's answer, kept only if every line is a well-formed changelog line
export const parseSummary = (text) => {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  return lines.every((l) => /^- \[(NEW|ENHANCED|FIX)\] \S/.test(l)) ? lines : null
}

const TITLE = '# Changelog\n\n'

export const prependSection = (file, section) =>
  `${TITLE}${section}\n${file.startsWith(TITLE) ? `\n${file.slice(TITLE.length)}` : ''}`

// one version's lines, for the GitHub release
export const releaseNotes = (file, version) => {
  const start = file.indexOf(`## v${version} `)
  if (start < 0) return ''
  const body = file.slice(file.indexOf('\n', start) + 1)
  const end = body.indexOf('\n## ')
  return (end < 0 ? body : body.slice(0, end)).trim()
}
