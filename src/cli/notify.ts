import { readFileSync } from 'node:fs'
import { connect } from 'node:net'
import { socketPointerPath } from './paths'

export type ChangeEvent = { kind: 'cards.changed'; ids: string[]; source: 'cli' }

// Best-effort push so a running app repaints now instead of at its next sync. The DB write already
// happened, so every failure here is silent by design: no app running, no socket, stale pointer.
export const notifyApp = (event: ChangeEvent, pointer = socketPointerPath(), timeoutMs = 200): void => {
  let path: string
  try {
    path = readFileSync(pointer, 'utf8').trim()
  } catch {
    return // app has never run, or isn't running now
  }
  if (!path) return
  try {
    const socket = connect(path)
    socket.setTimeout(timeoutMs)
    socket.on('error', () => socket.destroy())
    socket.on('timeout', () => socket.destroy())
    socket.on('connect', () => {
      socket.end(`${JSON.stringify(event)}\n`)
    })
    socket.unref() // never hold the process open for a notification
  } catch {
    // unreachable socket: the DB is still correct, the app catches up on its next sync
  }
}
