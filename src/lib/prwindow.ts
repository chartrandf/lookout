import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { openUrl } from '@tauri-apps/plugin-opener'

// Settings → "Open links in your default browser". Off (the default): a click opens the in-app
// window, CMD+click the default browser. On: the other way round, so both stay one gesture away.
let preferBrowser = false
export const setOpenLinksInBrowser = (on: boolean) => {
  preferBrowser = on
}

const prWindowLabel = (repo: string, prNumber: number) => `pr-${repo}-${prNumber}`.replace(/[^a-zA-Z0-9-]/g, '-')

// One window per PR (label = repo + number): re-clicking focuses instead of opening another tab.
// Built Rust-side (open_pr_window) so a navigation toolbar is injected into every page.
// cmd = the link was CMD+clicked: it flips whichever of the two the setting made the default.
export const openPrWindow = async (url: string, repo: string, prNumber: number, cmd = false) => {
  if (cmd !== preferBrowser) {
    await openUrl(url)
    return
  }
  const label = prWindowLabel(repo, prNumber)
  await invoke('open_pr_window', { label, url, title: `${repo}#${prNumber}` })
}

// The PR's window was closed (Rust emits pr-window:closed): whatever was done in it — a merge, a
// review — is on GitHub by now, so the open card refetches instead of waiting for a manual ↻.
export const onPrWindowClosed = (repo: string, prNumber: number, cb: () => void) => {
  const label = prWindowLabel(repo, prNumber)
  return listen<string>('pr-window:closed', (e) => {
    if (e.payload === label) cb()
  })
}
