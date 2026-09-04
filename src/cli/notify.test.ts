import { mkdtempSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { notifyApp } from './notify'

const tmp = () => mkdtempSync(join(tmpdir(), 'lookout-notify-'))

describe('notifyApp', () => {
  it('sends one line of JSON to the socket the app published', async () => {
    const dir = tmp()
    const sock = join(dir, 'cli.sock')
    const pointer = join(dir, 'cli.sock.path')
    writeFileSync(pointer, `${sock}\n`)

    const received = new Promise<string>((resolve) => {
      const server = createServer((c) => {
        let buf = ''
        c.on('data', (d) => {
          buf += d
        })
        c.on('end', () => {
          server.close()
          resolve(buf)
        })
      })
      server.listen(sock, () => notifyApp({ kind: 'cards.changed', ids: ['owner/repo#1'], source: 'cli' }, pointer))
    })

    expect(JSON.parse(await received)).toEqual({ kind: 'cards.changed', ids: ['owner/repo#1'], source: 'cli' })
  })

  // Every failure path is silent on purpose: the DB write already landed, so a missed notification
  // only costs the app a repaint until its next sync.
  it('says nothing when the app has never published a socket', () => {
    expect(() =>
      notifyApp({ kind: 'cards.changed', ids: ['x'], source: 'cli' }, join(tmp(), 'absent.path')),
    ).not.toThrow()
  })

  it('says nothing when the pointer is stale (socket gone)', () => {
    const dir = tmp()
    const pointer = join(dir, 'cli.sock.path')
    writeFileSync(pointer, join(dir, 'vanished.sock'))
    expect(() => notifyApp({ kind: 'cards.changed', ids: ['x'], source: 'cli' }, pointer)).not.toThrow()
  })

  it('says nothing when the pointer is empty', () => {
    const dir = tmp()
    const pointer = join(dir, 'cli.sock.path')
    writeFileSync(pointer, '')
    expect(() => notifyApp({ kind: 'cards.changed', ids: ['x'], source: 'cli' }, pointer)).not.toThrow()
  })
})
