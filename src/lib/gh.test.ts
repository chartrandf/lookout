import { describe, expect, it, vi } from 'vitest'

vi.mock('@tauri-apps/plugin-shell', () => ({ Command: { create: vi.fn() } }))

import { toTimelineEvent } from './gh'

describe('toTimelineEvent', () => {
  it('keeps the avatar GitHub sent, which is the only one that works for a bot', () => {
    const e = toTimelineEvent({
      event: 'commented',
      created_at: '2026-01-03T10:00:00Z',
      user: { login: 'some-app[bot]', avatar_url: 'https://avatars.githubusercontent.com/in/1001?v=4' },
      html_url: 'https://github.com/owner/repo/pull/1#c',
    })
    expect(e?.avatar).toBe('https://avatars.githubusercontent.com/in/1001?v=4')
  })

  it('takes the actor avatar for events that carry an actor, not a user', () => {
    const e = toTimelineEvent({
      event: 'head_ref_force_pushed',
      created_at: '2026-01-03T10:00:00Z',
      actor: { login: 'octo-dev', avatar_url: 'https://avatars.githubusercontent.com/u/2002?v=4' },
    })
    expect(e?.avatar).toBe('https://avatars.githubusercontent.com/u/2002?v=4')
  })

  // the timeline's commit only has the git author name; the PR commit list knows the account
  it('finds a commit author avatar through its sha', () => {
    const e = toTimelineEvent(
      {
        event: 'committed',
        sha: 'abc',
        author: { name: 'Ada Example', date: '2026-01-02T10:00:00Z' },
        message: 'fix',
      },
      new Map([['abc', 'https://avatars.githubusercontent.com/u/2002?v=4']]),
    )
    expect(e?.actor).toBe('Ada Example')
    expect(e?.avatar).toBe('https://avatars.githubusercontent.com/u/2002?v=4')
  })

  it('leaves the avatar out when GitHub sent none', () => {
    const e = toTimelineEvent({
      event: 'committed',
      sha: 'zzz',
      author: { name: 'Someone', date: '2026-01-02T00:00:00Z' },
    })
    expect(e?.avatar).toBeUndefined()
  })
})
