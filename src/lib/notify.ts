import { isPermissionGranted, onAction, requestPermission, sendNotification } from '@tauri-apps/plugin-notification'

let granted: boolean | null = null

export const notify = async (title: string, body: string, extra?: Record<string, unknown>) => {
  if (granted === null) {
    granted = await isPermissionGranted()
    if (!granted) granted = (await requestPermission()) === 'granted'
  }
  if (granted) sendNotification({ title, body, extra })
}

// Fires when the OS notification is clicked. Note: the plugin only delivers this on
// mobile today — on macOS a click just focuses the app — but the payload is wired
// so it starts working the day desktop support lands.
export const onNotificationClick = (cb: (extra: { notificationId?: number; taskId?: string }) => void) =>
  onAction((n) => cb((n.extra ?? {}) as { notificationId?: number; taskId?: string }))
