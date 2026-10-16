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
