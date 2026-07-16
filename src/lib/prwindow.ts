import { WebviewWindow } from '@tauri-apps/api/webviewWindow'
import { openUrl } from '@tauri-apps/plugin-opener'

// One window per PR (label = repo + number): re-clicking focuses instead of opening another tab.
// external (CMD+click) opens the OS default browser instead of the in-app window.
export const openPrWindow = async (url: string, repo: string, prNumber: number, external = false) => {
  if (external) {
    await openUrl(url)
    return
  }
  const label = `pr-${repo}-${prNumber}`.replace(/[^a-zA-Z0-9-]/g, '-')
  const existing = await WebviewWindow.getByLabel(label)
  if (existing) {
    await existing.setFocus()
    return
  }
  new WebviewWindow(label, {
    url,
    title: `${repo}#${prNumber}`,
    width: 1280,
    height: 900,
    // macOS glass titlebar looks broken over remote pages; overlay = traffic lights only
    titleBarStyle: 'overlay',
    hiddenTitle: true,
  })
}
