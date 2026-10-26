import { describe, expect, it, vi } from 'vitest'

vi.mock('@tauri-apps/plugin-shell', () => ({ Command: { create: vi.fn() } }))

import { parseConditional, reviewCommentCounts, toTimelineEvent } from './gh'

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

  it('reads a draft toggled either way', () => {
    const at = { created_at: '2026-01-03T10:00:00Z', actor: { login: 'octo-dev' } }
    expect(toTimelineEvent({ event: 'ready_for_review', ...at })?.kind).toBe('ready_for_review')
    expect(toTimelineEvent({ event: 'convert_to_draft', ...at })?.kind).toBe('convert_to_draft')
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

describe('review inline comments', () => {
  // the timeline's line-commented thread: each comment names the review it was posted in
  const thread = (...reviewIds: number[]) => ({
    event: 'line-commented',
    comments: reviewIds.map((id) => ({ pull_request_review_id: id })),
  })

  it('counts inline comments per review, across threads', () =>
    expect(reviewCommentCounts([thread(10, 10), thread(10, 11), { event: 'commented' }])).toEqual(
      new Map([
        [10, 3],
        [11, 1],
      ]),
    ))

  it('puts the count on the review, never the review body', () => {
    const e = toTimelineEvent(
      { event: 'reviewed', id: 10, state: 'approved', body: 'LGTM', submitted_at: '2026-01-03T10:00:00Z' },
      new Map(),
      new Map([[10, 2]]),
    )
    expect(e).toMatchObject({ kind: 'review', text: 'approved', comments: 2 })
  })

  it('leaves a review with no inline comment without a count', () => {
    const e = toTimelineEvent({ event: 'reviewed', id: 12, state: 'approved', submitted_at: '2026-01-03T10:00:00Z' })
    expect(e?.comments).toBeUndefined()
  })
})

describe('parseConditional', () => {
  it('reads the status, the ETag and the body of a 200', () => {
    const r = parseConditional('HTTP/2.0 200 OK\r\nEtag: W/"abc"\r\nX-Other: 1\r\n\r\n[{"number":1}]\n')
    expect(r).toEqual({ status: 200, etag: 'W/"abc"', body: '[{"number":1}]' })
  })

  it('reads a 304, which carries no body', () => {
    const r = parseConditional('HTTP/2.0 304 Not Modified\nEtag: "abc"\n')
    expect(r.status).toBe(304)
    expect(r.body).toBe('')
  })

  it('reports no status on output that is not an HTTP answer', () => {
    expect(parseConditional('').status).toBe(0)
  })
})
