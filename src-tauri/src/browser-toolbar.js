// Injected into every page of a PR browser window (see open_pr_window in lib.rs):
// a top navigation toolbar with back/forward/reload and an editable URL bar with a copy button.
// Left padding keeps the buttons clear of the macOS traffic lights (overlay titlebar).
;(() => {
  if (window.top !== window) return // main frame only

  const BAR_H = 46

  const init = () => {
    if (document.getElementById('__lookout_nav')) return

    const bar = document.createElement('div')
    bar.id = '__lookout_nav'
    // empty toolbar space drags the window (buttons/input are separate targets, unaffected);
    // needs the pr-windows capability granting start-dragging to remote pages
    bar.setAttribute('data-tauri-drag-region', '')
    bar.style.cssText =
      'position:fixed;left:0;right:0;top:0;z-index:2147483647;display:flex;align-items:center;gap:8px;' +
      `height:${BAR_H}px;padding:0 16px 0 88px;box-sizing:border-box;background:#ececec;border-bottom:1px solid #d0d0d0;` +
      'font:13px -apple-system,BlinkMacSystemFont,sans-serif;color:#333;'

    // SVG icons (feather-style): identical viewBox/stroke so all three center the same way
    const SVG = (size, inner) =>
      `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" ` +
      `stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:block">${inner}</svg>`
    const ICONS = {
      back: SVG(16, '<polyline points="15 18 9 12 15 6"/>'),
      forward: SVG(16, '<polyline points="9 18 15 12 9 6"/>'),
      reload: SVG(15, '<polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>'),
      copy: SVG(
        13,
        '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>' +
          '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
      ),
      check: SVG(13, '<polyline points="20 6 9 17 4 12"/>'),
      up: SVG(14, '<polyline points="18 15 12 9 6 15"/>'),
      down: SVG(14, '<polyline points="6 9 12 15 18 9"/>'),
      close: SVG(14, '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>'),
    }

    const btn = (icon, title, fn) => {
      const b = document.createElement('button')
      b.type = 'button'
      b.innerHTML = ICONS[icon]
      b.title = title
      b.style.cssText =
        'width:30px;height:30px;flex:none;border:0;border-radius:9999px;background:transparent;color:#444;' +
        'cursor:pointer;padding:0;display:flex;align-items:center;justify-content:center;'
      b.onmouseenter = () => {
        if (!b.disabled) b.style.background = '#dcdcdc'
      }
      b.onmouseleave = () => {
        b.style.background = 'transparent'
      }
      b.onclick = fn
      return b
    }

    // WebKit exposes no canGoBack/canGoForward, so track our own position in the session history:
    // a plain navigation truncates the forward entries and lands on top of the stack, and the
    // toolbar buttons are the only way to move within it, so they shift the index themselves.
    // sessionStorage carries the index across document loads; it is per-origin, so a cross-origin
    // back leaves the position unknown (null) and both buttons stay enabled rather than wrongly off.
    const IDX_KEY = '__lookout_hist_idx'
    const store = (v) => {
      try {
        sessionStorage.setItem(IDX_KEY, String(v))
      } catch {}
      return v
    }
    const restore = () => {
      try {
        const v = sessionStorage.getItem(IDX_KEY)
        return v === null ? null : Number(v)
      } catch {
        return null
      }
    }
    // only a plain navigation is known to land on top; a reload/back_forward (or an unreadable
    // navigation type) keeps the position the click handler saved before moving
    const navType = performance.getEntriesByType('navigation')[0]?.type
    let idx = navType === 'navigate' ? store(history.length - 1) : restore()

    const enable = (b, on) => {
      b.disabled = !on
      b.style.opacity = on ? '1' : '0.3'
      b.style.cursor = on ? 'pointer' : 'default'
      if (!on) b.style.background = 'transparent'
    }
    const syncNav = () => {
      // position unknown (cross-origin hop): fall back to "the stack holds more than one entry"
      enable(back, history.length > 1 && (idx === null || idx > 0))
      enable(forward, history.length > 1 && (idx === null || idx < history.length - 1))
    }
    const move = (delta) => () => {
      if (idx !== null) idx = store(idx + delta)
      if (delta < 0) history.back()
      else history.forward()
    }
    const back = btn('back', 'Back', move(-1))
    const forward = btn('forward', 'Forward', move(1))
    const reload = btn('reload', 'Reload', () => {
      // the document unloads mid-spin, but it still reads as feedback while the new one loads
      reload.firstElementChild.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }], {
        duration: 600,
        easing: 'ease-in-out',
      })
      location.reload()
    })

    const input = document.createElement('input')
    input.value = location.href
    input.spellcheck = false
    input.style.cssText =
      'width:100%;height:30px;border:1px solid #cfcfcf;border-radius:8px;background:#fff;color:#333;' +
      'padding:0 34px 0 10px;box-sizing:border-box;font:12px ui-monospace,SFMono-Regular,monospace;outline:none;' +
      'transition:background-color 150ms,border-color 150ms;'
    let justFocused = false
    input.onfocus = () => {
      input.style.background = '#fff'
      input.style.border = '2px solid #2bbd6e'
      input.style.padding = '0 33px 0 9px' // compensate the extra border px: no layout shift
      justFocused = true
      input.select()
    }
    // the click's mouseup would collapse the select-all right after focus — swallow it once
    input.onmouseup = (e) => {
      if (!justFocused) return
      e.preventDefault()
      justFocused = false
    }
    input.onblur = () => {
      input.style.border = '1px solid #cfcfcf'
      input.style.padding = '0 34px 0 10px'
      input.style.background = '#fff'
      justFocused = false
    }
    input.onkeydown = (e) => {
      if (e.key === 'Escape') {
        input.value = location.href // drop any edits
        input.blur()
        return
      }
      if (e.key !== 'Enter') return
      let v = input.value.trim()
      if (!v) return
      if (!/^https?:\/\//i.test(v)) v = `https://${v}`
      location.href = v
    }

    const copy = document.createElement('button')
    copy.type = 'button'
    copy.innerHTML = ICONS.copy
    copy.title = 'Copy URL'
    copy.style.cssText =
      'position:absolute;right:5px;width:22px;height:22px;flex:none;border:0;border-radius:6px;' +
      'background:transparent;color:#666;cursor:pointer;padding:0;display:flex;align-items:center;' +
      'justify-content:center;'
    copy.onmouseenter = () => {
      copy.style.background = '#e2e2e2'
    }
    copy.onmouseleave = () => {
      copy.style.background = 'transparent'
    }
    // keep the caret/selection where it is: clicking the icon must not focus it nor re-select the input
    copy.onmousedown = (e) => e.preventDefault()
    let copiedTimer
    copy.onclick = async () => {
      try {
        await navigator.clipboard.writeText(location.href)
      } catch {
        return // clipboard denied (non-secure context): leave the icon untouched
      }
      copy.innerHTML = ICONS.check
      copy.style.color = '#2bbd6e'
      clearTimeout(copiedTimer)
      copiedTimer = setTimeout(() => {
        copy.innerHTML = ICONS.copy
        copy.style.color = '#666'
      }, 1200)
    }

    // the copy button sits inside the input's box: the field positions it, the input's
    // right padding keeps a long URL from sliding under it
    const field = document.createElement('div')
    field.style.cssText = 'position:relative;flex:1;display:flex;align-items:center;margin:0 8px;'
    field.onmouseenter = () => {
      if (document.activeElement !== input) input.style.background = '#f0f0f0'
    }
    field.onmouseleave = () => {
      if (document.activeElement !== input) input.style.background = '#fff'
    }
    field.append(input, copy)

    bar.append(back, forward, reload, field)
    document.documentElement.appendChild(bar)
    // keep page content clear of the bar
    document.documentElement.style.paddingTop = `${BAR_H}px`
    syncNav()

    // a same-document move (GitHub's pushState nav) doesn't reload: refresh the buttons here
    let popped = false
    addEventListener('popstate', () => {
      popped = true // our buttons already shifted idx
      syncNav()
    })

    // GitHub navigates via pushState: keep the URL bar in sync (skip while the user is typing)
    let lastHref = location.href
    setInterval(() => {
      if (location.href !== lastHref) {
        lastHref = location.href
        if (popped) popped = false
        else if (idx !== null) idx = store(history.length - 1) // a new entry was pushed
      }
      if (document.activeElement !== input && input.value !== location.href) input.value = location.href
      syncNav()
    }, 500)

    // Find in page (Cmd+F, Ctrl+F off macOS): a bare WKWebView ships no find UI, so bring our own.
    // Matches are painted with the CSS Custom Highlight API — no DOM mutation, GitHub's React tree
    // stays untouched. Text is searched as one concatenated string so a match can span the token
    // <span>s of a highlighted diff line.
    const HL_ALL = '__lookout_find'
    const HL_CUR = '__lookout_find_cur'
    const HL_GONE = '__lookout_find_gone'
    const MAX_MATCHES = 1000
    const canHighlight = typeof Highlight === 'function' && !!window.CSS?.highlights
    if (canHighlight) {
      const css =
        `::highlight(${HL_ALL}){background-color:#ffe066;color:inherit}` +
        `::highlight(${HL_CUR}){background-color:#ff9632;color:inherit}` +
        `::highlight(${HL_GONE}){background-color:transparent}`
      // a constructed sheet doesn't depend on the page allowing inline <style>; <style> is the fallback
      try {
        const sheet = new CSSStyleSheet()
        sheet.replaceSync(css)
        document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet]
      } catch {
        const style = document.createElement('style')
        style.textContent = css
        document.documentElement.appendChild(style)
      }
    }

    const findBar = document.createElement('div')
    findBar.id = '__lookout_find'
    findBar.style.cssText =
      `position:fixed;top:${BAR_H + 6}px;right:16px;z-index:2147483647;display:none;align-items:center;gap:2px;` +
      'padding:4px 4px 4px 6px;background:#fff;border:1px solid #d0d0d0;border-radius:8px;' +
      'box-shadow:0 4px 14px rgba(0,0,0,.12);font:13px -apple-system,BlinkMacSystemFont,sans-serif;color:#333;'

    const findInput = document.createElement('input')
    findInput.placeholder = 'Find in page'
    findInput.spellcheck = false
    findInput.style.cssText =
      'width:200px;height:26px;border:1px solid #cfcfcf;border-radius:6px;background:#fff;color:#333;' +
      'padding:0 8px;box-sizing:border-box;font:12px -apple-system,BlinkMacSystemFont,sans-serif;outline:none;'
    findInput.onfocus = () => {
      findInput.style.borderColor = '#2bbd6e'
    }
    findInput.onblur = () => {
      findInput.style.borderColor = '#cfcfcf'
    }

    const counter = document.createElement('span')
    counter.style.cssText =
      'min-width:52px;padding:0 6px;text-align:right;font:11px ui-monospace,SFMono-Regular,monospace;color:#888;'

    let matches = []
    let cur = -1
    let capped = false

    const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'TEMPLATE'])
    const collect = (query) => {
      if (!document.body || !query) return []
      const visible = new Map() // per parent element: checkVisibility forces style, many nodes share a parent
      const isVisible = (el) => {
        let v = visible.get(el)
        if (v === undefined) {
          v =
            !SKIP.has(el.tagName) &&
            (el.checkVisibility ? el.checkVisibility({ visibilityProperty: true, checkVisibilityCSS: true }) : true)
          visible.set(el, v)
        }
        return v
      }
      // the toolbar and find bar hang off <html>, so walking <body> never matches them
      const nodes = []
      const starts = []
      let text = ''
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (!n.data || !n.parentElement || !isVisible(n.parentElement)) continue
        nodes.push(n)
        starts.push(text.length)
        text += n.data
      }
      // index of the node holding character `off` (last node starting at or before it)
      const locate = (off) => {
        let lo = 0
        let hi = starts.length - 1
        while (lo < hi) {
          const mid = (lo + hi + 1) >> 1
          if (starts[mid] <= off) lo = mid
          else hi = mid - 1
        }
        return lo
      }
      // a case-insensitive regex, not toLowerCase(): lowercasing can change string length and break offsets
      const re = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
      const found = []
      // one past the cap, to tell "exactly 1000" from "more"
      for (let m = re.exec(text); m && found.length <= MAX_MATCHES; m = re.exec(text)) {
        const end = m.index + m[0].length
        const s = locate(m.index)
        const e = locate(end - 1)
        const r = document.createRange()
        r.setStart(nodes[s], m.index - starts[s])
        r.setEnd(nodes[e], end - starts[e])
        found.push(r)
      }
      return found
    }

    let painted = []
    const paint = () => {
      if (canHighlight) {
        // WebKit repaints a range when it is added to a highlight, not when it is dropped: clearing
        // or closing would leave stale colors on screen. Re-adding the previous ranges under a
        // transparent, lowest-priority highlight forces that repaint.
        CSS.highlights.set(HL_GONE, new Highlight(...painted))
        const all = new Highlight(...matches)
        all.priority = 1
        CSS.highlights.set(HL_ALL, all)
        const current = new Highlight(...(cur >= 0 ? [matches[cur]] : []))
        current.priority = 2 // wins over HL_ALL on the same range
        CSS.highlights.set(HL_CUR, current)
        painted = matches
      }
      const q = findInput.value
      counter.textContent = q ? `${matches.length ? cur + 1 : 0}/${matches.length}${capped ? '+' : ''}` : ''
      counter.style.color = q && !matches.length ? '#d33' : '#888'
    }

    const reveal = (r) => {
      // nearest first: brings nested scroll boxes (wide diff tables) along, then center in the window
      r.startContainer.parentElement?.scrollIntoView({ block: 'nearest' })
      const rect = r.getBoundingClientRect()
      if (rect.top < BAR_H + 8 || rect.bottom > innerHeight - 8) scrollBy(0, rect.top - (BAR_H + innerHeight) / 2)
    }

    const run = (fresh) => {
      const found = collect(findInput.value)
      capped = found.length > MAX_MATCHES
      matches = found.slice(0, MAX_MATCHES)
      if (!matches.length) cur = -1
      else if (fresh) {
        // start at the first match below the toolbar rather than jumping back to the top
        const i = matches.findIndex((r) => r.getBoundingClientRect().top >= BAR_H)
        cur = i === -1 ? 0 : i
      } else cur = Math.min(Math.max(cur, 0), matches.length - 1)
      paint()
      if (fresh && cur >= 0) reveal(matches[cur])
    }

    const go = (delta) => {
      if (!matches.length) return
      cur = (cur + delta + matches.length) % matches.length
      paint()
      reveal(matches[cur])
    }

    // GitHub renders lazily and navigates via Turbo: re-search while open when the DOM changes,
    // ignoring our own toolbar/find bar updates (the counter text would otherwise loop forever)
    let rerunTimer
    const observer = new MutationObserver((records) => {
      if (records.every((r) => findBar.contains(r.target) || bar.contains(r.target))) return
      clearTimeout(rerunTimer)
      rerunTimer = setTimeout(() => run(false), 300)
    })

    const isOpen = () => findBar.style.display !== 'none'
    const openFind = () => {
      findBar.style.display = 'flex'
      findInput.focus()
      findInput.select()
      observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true })
      if (findInput.value) run(false) // the query is kept across close/reopen, the page may have changed
    }
    let typeTimer = 0
    const closeFind = () => {
      findInput.blur()
      findBar.style.display = 'none'
      observer.disconnect()
      clearTimeout(rerunTimer)
      clearTimeout(typeTimer)
      typeTimer = 0
      matches = []
      cur = -1
      paint()
    }

    findInput.oninput = () => {
      clearTimeout(typeTimer)
      typeTimer = setTimeout(() => {
        typeTimer = 0
        run(true)
      }, 120)
    }
    findInput.onkeydown = (e) => {
      e.stopPropagation() // keep GitHub's document-level hotkeys out of the find field
      if (e.key === 'Escape') {
        e.preventDefault()
        closeFind()
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (typeTimer) {
          // Enter before the debounce fired: search now, landing on the first match
          clearTimeout(typeTimer)
          typeTimer = 0
          run(true)
        } else go(e.shiftKey ? -1 : 1)
      }
    }

    const small = (b) => {
      b.style.width = '24px'
      b.style.height = '24px'
      b.onmousedown = (e) => e.preventDefault() // keep focus in the find field
      return b
    }
    findBar.append(
      findInput,
      counter,
      small(btn('up', 'Previous match (⇧↵)', () => go(-1))),
      small(btn('down', 'Next match (↵)', () => go(1))),
      small(btn('close', 'Close (Esc)', closeFind)),
    )
    document.documentElement.appendChild(findBar)

    // capture phase on window: runs before GitHub's own Cmd+F handlers (code/diff views take it over).
    // Ctrl on macOS is left alone — Ctrl+F moves the caret in text fields there.
    const isMac = /Mac/.test(navigator.platform)
    addEventListener(
      'keydown',
      (e) => {
        if (!(isMac ? e.metaKey : e.ctrlKey) || e.altKey) return
        const k = e.key.toLowerCase()
        if (k === 'f' && !e.shiftKey) openFind()
        else if (k === 'g' && isOpen()) go(e.shiftKey ? -1 : 1)
        else return
        e.preventDefault()
        e.stopImmediatePropagation()
      },
      true,
    )
  }

  // inject immediately (init scripts run at document start, <html> already exists) so the bar
  // shows while the page is still loading; DOMContentLoaded is just a safety re-run
  if (document.documentElement) init()
  document.addEventListener('DOMContentLoaded', init)
})()
