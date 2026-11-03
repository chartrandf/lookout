import { appCacheDir, join } from '@tauri-apps/api/path'
import { BaseDirectory, exists, mkdir, readDir, remove, writeFile } from '@tauri-apps/plugin-fs'

// Files dropped on a chat box become `@path` references, the syntax claude reads as a file to open

// The paths behind a drop: Finder hands file:// URLs in the uri-list, some sources only plain paths
export const droppedPaths = (uriList: string, text: string): string[] => {
  const urls = uriList
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.startsWith('file://'))
  if (urls.length > 0) return urls.map((u) => decodeURIComponent(new URL(u).pathname))
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  return lines.length > 0 && lines.every((l) => l.startsWith('/')) ? lines : []
}

// what to insert after `before`: kept apart from the word before it, and from what comes next
export const fileRefs = (paths: string[], before: string) =>
  `${before === '' || /\s$/.test(before) ? '' : ' '}${paths.map((p) => `@${p}`).join(' ')} `

// An image dropped with no path behind it (the macOS screenshot thumbnail, an image off a web page)
// is saved to the app cache so it has one. Kept there, not in a temp file: the agent reads it later.
export const droppedImageName = (type: string, now: number, i: number) => {
  const sub =
    type
      .split('/')[1]
      ?.split('+')[0]
      .replace(/[^a-z0-9]/gi, '') || 'png'
  return `chat-images/${now}-${i}.${sub === 'jpeg' ? 'jpg' : sub}`
}

export const saveDroppedImages = async (files: File[]): Promise<string[]> => {
  const images = files.filter((f) => f.type.startsWith('image/'))
  if (images.length === 0) return []
  await mkdir('chat-images', { baseDir: BaseDirectory.AppCache, recursive: true })
  const dir = await appCacheDir()
  const now = Date.now()
  return Promise.all(
    images.map(async (f, i) => {
      const name = droppedImageName(f.type, now, i)
      await writeFile(name, new Uint8Array(await f.arrayBuffer()), { baseDir: BaseDirectory.AppCache })
      return join(dir, name)
    }),
  )
}

const IMAGE_TTL_MS = 14 * 86400_000

// Saved images older than 14 days, by the drop time in their name. The agent already read them into
// its session, so a resumed session doesn't need the file.
export const expiredImages = (names: string[], now: number) =>
  names.filter((n) => {
    const m = n.match(/^(\d+)-\d+\.\w+$/)
    return !!m && now - Number(m[1]) > IMAGE_TTL_MS
  })

export const pruneDroppedImages = async () => {
  const opts = { baseDir: BaseDirectory.AppCache }
  if (!(await exists('chat-images', opts))) return
  const names = (await readDir('chat-images', opts)).filter((e) => e.isFile).map((e) => e.name)
  for (const n of expiredImages(names, Date.now())) await remove(`chat-images/${n}`, opts)
}
