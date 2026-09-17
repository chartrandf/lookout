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
  }

  // inject immediately (init scripts run at document start, <html> already exists) so the bar
  // shows while the page is still loading; DOMContentLoaded is just a safety re-run
  if (document.documentElement) init()
  document.addEventListener('DOMContentLoaded', init)
})()
