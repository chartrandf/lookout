import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: vi.fn() }))
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }))

import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { openUrl } from '@tauri-apps/plugin-opener'
import { onPrWindowClosed, openPrWindow, setOpenLinksInBrowser } from './prwindow'

const URL_ = 'https://github.com/owner/repo/pull/1'

describe('openPrWindow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setOpenLinksInBrowser(false)
  })

  it('opens the in-app window by default, the browser on Cmd-click', async () => {
    await openPrWindow(URL_, 'owner/repo', 1)
    expect(invoke).toHaveBeenCalledWith('open_pr_window', expect.objectContaining({ url: URL_ }))
    await openPrWindow(URL_, 'owner/repo', 1, true)
    expect(openUrl).toHaveBeenCalledWith(URL_)
  })

  it('with the setting on, opens the browser — and Cmd-click the in-app window', async () => {
    setOpenLinksInBrowser(true)
    await openPrWindow(URL_, 'owner/repo', 1)
    expect(openUrl).toHaveBeenCalledWith(URL_)
    expect(invoke).not.toHaveBeenCalled()
    await openPrWindow(URL_, 'owner/repo', 1, true)
    expect(invoke).toHaveBeenCalledWith('open_pr_window', expect.objectContaining({ url: URL_ }))
  })
})

describe('onPrWindowClosed', () => {
  it("fires only when this PR's window closes", async () => {
    vi.mocked(listen).mockResolvedValue(() => {})
    const cb = vi.fn()
    await onPrWindowClosed('owner/repo', 1, cb)
    const handler = vi.mocked(listen).mock.calls[0][1] as (e: { payload: string }) => void
    handler({ payload: 'pr-owner-repo-2' })
    expect(cb).not.toHaveBeenCalled()
    handler({ payload: 'pr-owner-repo-1' })
    expect(cb).toHaveBeenCalledOnce()
  })
})
