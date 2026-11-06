// Theme helper. Load it right after theme.css, as a plain (not deferred) script:
//
//   <link rel="stylesheet" href="theme/theme.css">
//   <script src="theme/theme.js"></script>
//
// URL parameters, for every page that uses the theme:
//   theme=<name>       use themes/<name>.css on top of the default theme
//   font=<family>      title font, e.g. font=Orbitron (any family from fonts/fonts.css)
//   font-ui=<family>   font for other text
//   font-mono=<family> font for numbers and data
//   margin=<length>       distance of text to the screen edge, e.g. margin=4 (vmin) or margin=40px
//   field-margin=<length> distance of full-screen content to the screen edge, e.g. field-margin=0
//   duration=<time>    show a progress bar filling over the display time ("30s", "1500ms")
//
// For scripts (e.g. canvas animations), window.Theme offers:
//   Theme.name                the theme from ?theme=, or "default"
//   Theme.token("--accent")   raw value of a token
//   Theme.color("--accent")   a token as [r, g, b, a] (0-255, a 0-1)
//   Theme.palette()           the --palette colours as [[r, g, b, a], ...], light to dark
//   Theme.rgba(c, alpha)      a colour array as CSS string, with optional alpha
//   Theme.px("--field-margin") a length token in CSS pixels, for the current viewport
//   Theme.ready               promise, resolved when the page and its fonts are loaded
(() => {
  'use strict'

  const params = new URLSearchParams(location.search)
  const base = new URL('.', document.currentScript.src)

  // Extra theme: written into the head while it is parsed, so it applies before the first paint.
  const theme = params.get('theme')
  if (theme && /^[a-z0-9-]+$/.test(theme)) {
    document.write(`<link rel="stylesheet" href="${new URL(`themes/${theme}.css`, base)}">`)
  }

  // Font overrides go on <html> as inline style, which wins over the theme's :root.
  const fontName = /^[A-Za-z0-9 -]+$/
  for (const [param, token, fallback] of [
    ['font', '--font-display', 'sans-serif'],
    ['font-ui', '--font-ui', 'sans-serif'],
    ['font-mono', '--font-mono', 'monospace'],
  ]) {
    const v = params.get(param)
    if (v && fontName.test(v)) document.documentElement.style.setProperty(token, `"${v}", ${fallback}`)
  }

  // Margins: a number means vmin; px, vmin, vw, vh and % are taken as given.
  for (const [param, tok] of [['margin', '--margin'], ['field-margin', '--field-margin']]) {
    const m = /^(\d+(?:\.\d+)?)(px|vmin|vw|vh|%)?$/.exec(params.get(param) || '')
    if (m) document.documentElement.style.setProperty(tok, m[1] + (m[2] || 'vmin'))
  }

  // ---------- colours ----------
  let probe = null
  function parseColor(css) {
    if (!probe) {
      const c = document.createElement('canvas')
      c.width = c.height = 1
      probe = c.getContext('2d', { willReadFrequently: true })
    }
    probe.clearRect(0, 0, 1, 1)
    probe.fillStyle = '#000'
    probe.fillStyle = css.trim()
    probe.fillRect(0, 0, 1, 1)
    const d = probe.getImageData(0, 0, 1, 1).data
    return [d[0], d[1], d[2], d[3] / 255]
  }
  const token = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim()

  window.Theme = {
    name: theme || 'default',
    token,
    color: name => parseColor(token(name)),
    palette: () => token('--palette').split(/,(?![^(]*\))/).map(parseColor),
    rgba: (c, alpha = c[3] ?? 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${alpha})`,
    px: name => {
      const probe = document.createElement('div')
      probe.style.cssText = `position:absolute;visibility:hidden;width:var(${name})`
      document.body.appendChild(probe)
      const w = probe.getBoundingClientRect().width
      probe.remove()
      return w
    },
    ready: new Promise(resolve => {
      const go = () => document.fonts.ready.then(() => resolve())
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go)
      else go()
    }),
  }

  // ---------- progress bar ----------
  const UNITS = { ms: 1, s: 1000, m: 60000, h: 3600000 }
  const m = /^(\d+)(ms|s|m|h)$/.exec(params.get('duration') || '')
  const duration = m ? Number(m[1]) * UNITS[m[2]] : 0
  if (duration > 0) {
    document.addEventListener('DOMContentLoaded', () => {
      const bar = document.createElement('div')
      bar.className = 'theme-progress'
      bar.style.transitionDuration = `${duration}ms`
      document.body.appendChild(bar)
      requestAnimationFrame(() => requestAnimationFrame(() => bar.classList.add('running')))
    })
  }
})()
