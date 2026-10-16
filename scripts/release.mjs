import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline/promises'
import {
  bumpVersion,
  commitLines,
  parseSummary,
  prependSection,
  releaseNotes,
  renderSection,
  summaryPrompt,
} from './changelog.mjs'

// pnpm release <patch|minor|major>: CHANGELOG.md + version bump in one commit, a tag, then the
// GitHub release, whose publishing starts the build (.github/workflows/release.yml)
const kind = process.argv[2]
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: 'utf8', ...opts }).trim()
const git = (...args) => run('git', args)
const fail = (msg) => {
  console.error(`release: ${msg}`)
  process.exit(1)
}

const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
let version
try {
  version = bumpVersion(pkg.version, kind)
} catch (e) {
  fail(`${e.message}\nusage: pnpm release <patch|minor|major>`)
}
const tag = `v${version}`

if (git('branch', '--show-current') !== 'main') fail('release from main')
if (git('status', '--porcelain')) fail('working tree not clean')
git('fetch', '-q', 'origin', 'main', '--tags')
if (git('rev-parse', 'HEAD') !== git('rev-parse', 'origin/main')) fail('main is not in sync with origin/main')
if (git('tag', '-l', tag)) fail(`${tag} already exists`)

const prev = git('describe', '--tags', '--abbrev=0', '--match', 'v*')
const subjects = git('log', `${prev}..HEAD`, '--no-merges', '--format=%s').split('\n').filter(Boolean)
// Claude groups related commits into a few lines; without it (or on a malformed answer), one line per commit
const summarize = () => {
  if (!subjects.length) return []
  try {
    console.log('summarizing the changes with Claude…')
    return parseSummary(run('claude', ['-p', '--model', 'sonnet'], { input: summaryPrompt(subjects) })) ?? commitLines(subjects)
  } catch {
    return commitLines(subjects)
  }
}
const section = renderSection(version, new Date().toISOString().slice(0, 10), summarize())
const file = existsSync('CHANGELOG.md') ? readFileSync('CHANGELOG.md', 'utf8') : ''
writeFileSync('CHANGELOG.md', prependSection(file, section))

console.log(`\n${prev} -> ${tag}\n\n${section}\n`)
// commit subjects aren't always what a user should read: a chance to reword before it ships
if (process.stdin.isTTY) {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  await rl.question('Edit CHANGELOG.md if needed, then Enter to release (Ctrl-C aborts, `git checkout .` undoes) ')
  rl.close()
}

run('npm', ['version', version, '--no-git-tag-version', '--ignore-scripts'], { stdio: 'inherit' })
run('node', ['scripts/sync-version.mjs'], { stdio: 'inherit' })
const files = [
  'CHANGELOG.md',
  'package.json',
  'package-lock.json',
  'src-tauri/tauri.conf.json',
  'src-tauri/Cargo.toml',
  'src-tauri/Cargo.lock',
  'Casks/lookout.rb',
]
git('add', ...files)
git('commit', '-q', '-m', `chore: release ${tag}`)
git('tag', '-a', tag, '-m', `chore: release ${tag}`)
git('push', '--atomic', 'origin', 'HEAD:main', tag)

const install = readFileSync('.github/release-install.md', 'utf8')
const notes = `${releaseNotes(readFileSync('CHANGELOG.md', 'utf8'), version)}\n\n${install}`
run('gh', ['release', 'create', tag, '--verify-tag', '--title', `Lookout ${tag}`, '--notes-file', '-'], {
  input: notes,
  stdio: ['pipe', 'inherit', 'inherit'],
})
console.log(`\nreleased ${tag}: the build runs in GitHub Actions`)
