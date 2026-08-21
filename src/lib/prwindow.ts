import { invoke } from '@tauri-apps/api/core'
import { openUrl } from '@tauri-apps/plugin-opener'

// One window per PR (label = repo + number): re-clicking focuses instead of opening another tab.
// Built Rust-side (open_pr_window) so a navigation toolbar is injected into every page.
// external (CMD+click) opens the OS default browser instead of the in-app window.
export const openPrWindow = async (url: string, repo: string, prNumber: number, external = false) => {
  if (external) {
    await openUrl(url)
    return
  }
  const label = `pr-${repo}-${prNumber}`.replace(/[^a-zA-Z0-9-]/g, '-')
  await invoke('open_pr_window', { label, url, title: `${repo}#${prNumber}` })
}
