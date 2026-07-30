import { readFileSync, writeFileSync } from 'node:fs'

// Runs from the `version` lifecycle hook, after npm bumps package.json and
// before it commits. Keeps the Tauri/Cargo versions in lockstep.
const { version } = JSON.parse(readFileSync('package.json', 'utf8'))

const sync = (file, pattern) => {
  const before = readFileSync(file, 'utf8')
  if (!pattern.test(before)) throw new Error(`sync-version: no version match in ${file}`)
  writeFileSync(file, before.replace(pattern, `$1${version}$2`))
  console.log(`  ${file} -> ${version}`)
}

sync('src-tauri/tauri.conf.json', /("version":\s*")[^"]+(")/)
sync('src-tauri/Cargo.toml', /^(version = ")[^"]+(")/m)
sync('src-tauri/Cargo.lock', /(name = "lookout"\nversion = ")[^"]+(")/)
