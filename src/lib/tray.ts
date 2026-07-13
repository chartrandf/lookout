import { defaultWindowIcon } from '@tauri-apps/api/app'
import { Menu, PredefinedMenuItem } from '@tauri-apps/api/menu'
import { TrayIcon } from '@tauri-apps/api/tray'
import { getCurrentWindow } from '@tauri-apps/api/window'

let tray: TrayIcon | null = null
let initStarted = false

export const showMainWindow = async () => {
  const win = getCurrentWindow()
  await win.show()
  await win.unminimize()
  await win.setFocus()
}

// Menu-bar icon: badge shows pending count, window hides on close instead of quitting.
export const initTray = async () => {
  if (initStarted) return
  initStarted = true

  const win = getCurrentWindow()
  await win.onCloseRequested(async (e) => {
    e.preventDefault()
    await win.hide()
  })

  const menu = await Menu.new({
    items: [
      { id: 'open', text: 'Open Lookout', action: showMainWindow },
      await PredefinedMenuItem.new({ item: 'Separator' }),
      await PredefinedMenuItem.new({ item: 'Quit', text: 'Quit Lookout' }),
    ],
  })

  tray = await TrayIcon.new({
    id: 'main-tray',
    icon: (await defaultWindowIcon()) ?? undefined,
    iconAsTemplate: true,
    tooltip: 'Lookout',
    menu,
    showMenuOnLeftClick: true,
  })
}

export const setTrayCount = async (count: number) => {
  await tray?.setTitle(count > 0 ? String(count) : null)
}
