// `node:sqlite` exists from 22.5 but stays behind --experimental-sqlite until it was unflagged in
// 22.13 (and 23.4 on the odd line). Since the CLI is invoked as a bare `lookout`, nobody can pass
// that flag — so an unflagged build is the real floor.
export const MIN_NODE = '22.13 (or 23.4+)'

export const isSupportedNode = (version: string): boolean => {
  const [major, minor] = version.replace(/^v/, '').split('.').map(Number)
  if (Number.isNaN(major) || Number.isNaN(minor)) return false
  if (major > 23) return true
  if (major === 23) return minor >= 4
  if (major === 22) return minor >= 13
  return false
}
