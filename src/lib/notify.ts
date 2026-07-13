import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification'

let granted: boolean | null = null

export const notify = async (title: string, body: string) => {
  if (granted === null) {
    granted = await isPermissionGranted()
    if (!granted) granted = (await requestPermission()) === 'granted'
  }
  if (granted) sendNotification({ title, body })
}
