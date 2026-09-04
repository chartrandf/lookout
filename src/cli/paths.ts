import { homedir, platform } from 'node:os'
import { join } from 'node:path'

// Where tauri-plugin-sql keeps the app's SQLite file. It resolves `sqlite:lookout.db` against
// Tauri's app_config_dir() (tauri-plugin-sql 2.4.0, src/wrapper.rs:81), which is a different shape
// per platform — hence a function with tests rather than a hardcoded path.
const APP_ID = 'com.francischartrand.lookout'

type Env = { LOOKOUT_DB?: string; XDG_CONFIG_HOME?: string; HOME?: string }

export const appConfigDir = (env: Env = process.env, os: string = platform()): string => {
  const home = env.HOME ?? homedir()
  if (os === 'darwin') return join(home, 'Library', 'Application Support', APP_ID)
  return join(env.XDG_CONFIG_HOME ?? join(home, '.config'), APP_ID) // linux
}

export const resolveDbPath = (env: Env = process.env, os: string = platform()): string =>
  env.LOOKOUT_DB ?? join(appConfigDir(env, os), 'lookout.db')

// The app publishes the socket it listens on here (it picks the path; we just read it), so the CLI
// needs no platform knowledge and no agreement to keep in sync.
export const socketPointerPath = (env: Env = process.env, os: string = platform()): string =>
  join(appConfigDir(env, os), 'cli.sock.path')
