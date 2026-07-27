import { Marked, Renderer } from 'marked'
import { useMemo } from 'react'

// Renderer shared by the session console and the review-report overlay.
// Claude output quotes PR bodies and diffs, so raw HTML is escaped instead of injected, and only
// http/mailto links survive. Tables are wrapped in a scroller so a wide table can never widen
// the panel.
const escapeTags = (s: string) => s.replace(/[<>]/g, (c) => (c === '<' ? '&lt;' : '&gt;'))

const renderer = new Renderer()

renderer.html = ({ text }) => escapeTags(text)

renderer.table = function table(token) {
  const html = Renderer.prototype.table.call(this, token)
  return `<div class="md-table-wrap">${String(html).replace('<table>', '<table class="md-table">')}</div>`
}

renderer.link = function link({ href, title, tokens }) {
  const body = this.parser.parseInline(tokens)
  if (!/^(https?:|mailto:)/i.test(href)) return body // drop javascript:/data: and friends
  return `<a href="${escapeTags(href).replace(/"/g, '&quot;')}"${title ? ` title="${escapeTags(title)}"` : ''}>${body}</a>`
}

const md = new Marked({ gfm: true, breaks: true, renderer })

type Props = {
  text: string
  className?: string
  // links open through the app browser instead of navigating the webview away
  onLink?: (url: string, external: boolean) => void
}

export const Markdown = ({ text, className = '', onLink }: Props) => {
  // Streaming output is often half-written markdown; marked degrades gracefully (an open fence is a
  // code block, a table missing its delimiter row stays a paragraph), and a throw falls back to text.
  const html = useMemo(() => {
    try {
      return md.parse(text, { async: false })
    } catch {
      return `<p>${escapeTags(text)}</p>`
    }
  }, [text])

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: only intercepts clicks bubbling from anchors, which Enter already fires
    // biome-ignore lint/a11y/noStaticElementInteractions: same — the interactive elements are the rendered links
    <div
      className={className}
      onClick={(e) => {
        const a = (e.target as HTMLElement).closest('a')
        const href = a?.getAttribute('href')
        if (!href || !onLink) return
        e.preventDefault()
        onLink(href, e.metaKey)
      }}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: markdown-only HTML, tags escaped above
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
