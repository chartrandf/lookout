import { describe, expect, it } from 'vitest'
import { parseChangelog } from './changelog'

describe('parseChangelog', () => {
  it('reads each release with its tagged lines', () => {
    const file = [
      '# Changelog',
      '',
      '## v0.2.0 — 2026-10-16',
      '',
      '- [NEW] Dark mode',
      '- [ENHANCED] Faster sync',
      '- [FIX] Crash on start',
      '',
      '## v0.1.0 — 2026-10-01',
      '',
      '- Internal changes only',
      '',
    ].join('\n')
    expect(parseChangelog(file)).toEqual([
      {
        title: 'v0.2.0 — 2026-10-16',
        items: [
          { tag: 'NEW', text: 'Dark mode' },
          { tag: 'ENHANCED', text: 'Faster sync' },
          { tag: 'FIX', text: 'Crash on start' },
        ],
      },
      { title: 'v0.1.0 — 2026-10-01', items: [{ tag: null, text: 'Internal changes only' }] },
    ])
  })
})
