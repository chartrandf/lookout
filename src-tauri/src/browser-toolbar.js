// Injected into every page of a PR browser window (see open_pr_window in lib.rs):
// a top navigation toolbar with back/forward/reload and an editable URL bar.
// Left padding keeps the buttons clear of the macOS traffic lights (overlay titlebar).
;(() => {
  if (window.top !== window) return // main frame only

  const BAR_H = 46

  const init = () => {
    if (document.getElementById('__lookout_nav')) return

    const bar = document.createElement('div')
    bar.id = '__lookout_nav'
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
        b.style.background = '#dcdcdc'
      }
      b.onmouseleave = () => {
        b.style.background = 'transparent'
      }
      b.onclick = fn
      return b
    }

    const input = document.createElement('input')
    input.value = location.href
    input.spellcheck = false
    input.style.cssText =
      'flex:1;height:30px;margin:0 8px;border:1px solid #cfcfcf;border-radius:8px;background:#fff;color:#333;' +
      'padding:0 10px;box-sizing:border-box;font:12px ui-monospace,SFMono-Regular,monospace;outline:none;' +
      'transition:background-color 150ms,border-color 150ms;'
    input.onmouseenter = () => {
      if (document.activeElement !== input) input.style.background = '#f0f0f0'
    }
    input.onmouseleave = () => {
      if (document.activeElement !== input) input.style.background = '#fff'
    }
    let justFocused = false
    input.onfocus = () => {
      input.style.background = '#fff'
      input.style.border = '2px solid #2bbd6e'
      input.style.padding = '0 9px' // compensate the extra border px: no layout shift
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
      input.style.padding = '0 10px'
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

    bar.append(
      btn('back', 'Back', () => history.back()),
      btn('forward', 'Forward', () => history.forward()),
      btn('reload', 'Reload', () => location.reload()),
      input,
    )
    document.documentElement.appendChild(bar)
    // keep page content clear of the bar
    document.documentElement.style.paddingTop = `${BAR_H}px`

    // GitHub navigates via pushState: keep the URL bar in sync (skip while the user is typing)
    setInterval(() => {
      if (document.activeElement !== input && input.value !== location.href) input.value = location.href
    }, 500)
  }

  // inject immediately (init scripts run at document start, <html> already exists) so the bar
  // shows while the page is still loading; DOMContentLoaded is just a safety re-run
  if (document.documentElement) init()
  document.addEventListener('DOMContentLoaded', init)
})()
