import { describe, expect, it } from 'vitest'
import {
  bumpVersion,
  commitLines,
  opencodeAnswer,
  parseSummary,
  prependSection,
  releaseNotes,
  renderSection,
  summaryCommand,
} from './changelog.mjs'

describe('bumpVersion', () => {
  it('bumps the asked part and resets the smaller ones', () => {
    expect(bumpVersion('0.4.21', 'patch')).toBe('0.4.22')
    expect(bumpVersion('0.4.21', 'minor')).toBe('0.5.0')
    expect(bumpVersion('0.4.21', 'major')).toBe('1.0.0')
  })

  it('refuses an unknown bump or version', () => {
    expect(() => bumpVersion('0.4.21', 'huge')).toThrow()
    expect(() => bumpVersion('0.4', 'patch')).toThrow()
  })
})

describe('commitLines', () => {
  it('keeps features, fixes and perf only, grouped NEW, ENHANCED then FIX', () => {
    expect(
      commitLines([
        'fix(board): snoozed count skips cards off the board',
        'chore(cask): lookout 0.4.20',
        'feat(chat): dropped file inserts @path reference',
        'perf: faster sync',
        'refactor: split feed',
        'feat!: new config format',
      ]),
    ).toEqual([
      '- [NEW] Dropped file inserts @path reference',
      '- [NEW] New config format',
      '- [ENHANCED] Faster sync',
      '- [FIX] Snoozed count skips cards off the board',
    ])
  })
})

describe('renderSection', () => {
  it('heads the lines with the version and date', () => {
    expect(renderSection('0.4.22', '2026-10-16', ['- [NEW] a'])).toBe('## v0.4.22 — 2026-10-16\n\n- [NEW] a')
  })

  it('says so when nothing user-facing changed', () => {
    expect(renderSection('0.4.22', '2026-10-16', [])).toContain('- Internal changes only')
  })
})

describe('parseSummary', () => {
  it('keeps well-formed lines', () => {
    expect(parseSummary('\n- [NEW] Stream board\n- [FIX] Snooze\n')).toEqual(['- [NEW] Stream board', '- [FIX] Snooze'])
  })

  it('puts NEW first, then ENHANCED, then FIX', () => {
    expect(parseSummary('- [FIX] a\n- [ENHANCED] b\n- [NEW] c')).toEqual(['- [NEW] c', '- [ENHANCED] b', '- [FIX] a'])
  })

  it('rejects an answer with anything else in it', () => {
    expect(parseSummary('Here is the changelog:\n- [NEW] Stream board')).toBeNull()
  })
})

describe('prependSection', () => {
  it('starts the file when there is none', () => {
    expect(prependSection('', '## v1')).toBe('# Changelog\n\n## v1\n')
  })

  it('puts the newest release on top, under the title', () => {
    expect(prependSection('# Changelog\n\n## v1\n', '## v2')).toBe('# Changelog\n\n## v2\n\n## v1\n')
  })
})

describe('releaseNotes', () => {
  it('is the version section without its heading', () => {
    const file = '# Changelog\n\n## v2 — d\n\n- [NEW] b\n\n## v1 — d\n\n- [FIX] a\n'
    expect(releaseNotes(file, '2')).toBe('- [NEW] b')
    expect(releaseNotes(file, '1')).toBe('- [FIX] a')
  })
})

describe('summaryCommand', () => {
  it('asks claude on Sonnet when the app picked no agent or model', () => {
    expect(summaryCommand(null, 'p')).toEqual({ cmd: 'claude', args: ['-p', '--model', 'sonnet'], input: 'p' })
    expect(summaryCommand({ cli: 'claude', strongModel: 'opus' }, 'p').args).toEqual(['-p', '--model', 'opus'])
  })

  it('runs opencode with the prompt as message and an empty stdin', () => {
    expect(summaryCommand({ cli: 'opencode', strongModel: 'acme/big' }, 'p')).toEqual({
      cmd: 'opencode',
      args: ['run', '--format', 'json', '--model', 'acme/big', 'p'],
      input: '',
    })
    expect(summaryCommand({ cli: 'opencode', strongModel: '' }, 'p').args).toEqual([
      'run',
      '--format',
      'json',
      '--model',
      'opencode/big-pickle',
      'p',
    ])
  })
})

describe('opencodeAnswer', () => {
  const ev = (o) => JSON.stringify(o)
  it('keeps the last step text', () => {
    const out = [
      ev({ type: 'step_start' }),
      ev({ type: 'text', part: { text: 'thinking' } }),
      ev({ type: 'step_start' }),
      ev({ type: 'text', part: { text: '- feat: x' } }),
      ev({ type: 'step_finish', part: { reason: 'stop' } }),
    ].join('\n')
    expect(opencodeAnswer(out)).toBe('- feat: x')
  })

  it('is null on an error or no text', () => {
    expect(opencodeAnswer(ev({ type: 'error', error: { name: 'APIError' } }))).toBeNull()
    expect(opencodeAnswer('')).toBeNull()
  })
})
