// Random 40C3 assets from the style guide (guides/40c3/Assets): boxes, icons, patterns, logos.
//
//   <script src="40c3/assets.js"></script>
//
//   const A = await C3Assets.load()              // fetches the asset files once
//   el.append(A.svg('Boxes/Box_Mate'))            // one asset as <svg>
//   el.append(A.random('box'))                    // a random one of a kind
//   A.pick('box', 3)                              // three different names, at random
//   A.names('icon')                               // all names of a kind
//
// Kinds: box (Boxes), icon (Icons_Deco), pattern (Patterns), logo (40C3 logo), logotext
// (logo with "MODEL_ CITIZENS"). Names are paths below Assets without ".svg".
//
// Colours: the assets are drawn in the guide's key colours. Each is mapped to one of three
// slots, as CSS variables on the <svg>, so an asset follows the page's theme variant as on the
// guide's "Color variants" pages:
//   --c3-fg     green and every other colour (default: the theme's --accent)
//   --c3-light  the light A                  (default: --ink)
//   --c3-dark   the dark B                   (default: --bg; inside of boxes)
// An asset drawn only in dark (some squares, lines) takes --c3-fg instead, so it shows on
// the dark key background. Pass { colors: { fg, light, dark } } to set them otherwise.
(() => {
  'use strict'

  const DEFAULT_BASE = new URL('../guides/40c3/Assets/', document.currentScript.src)

  const FILES = {
    box: ['Blinken', 'BTX', 'Cables', 'Eyes', 'Fairydust', 'Friends', 'Keyboard', 'Key', 'Leg', 'Lime',
      'Lines', 'Long', 'Luckycat', 'Magic', 'Mate', 'Phasetester', 'Record', 'Scribble', 'Steampunk',
      'Trojan', 'Video'].map(n => `Boxes/Box_${n}`),
    icon: ['Arrow', 'Chaosknoten', 'Chaospost', 'Fairydust', 'Icon_10', 'Icon_Bitspider', 'Icon_Blinkenheart',
      'Icon_Blob0', 'Icon_Blob1', 'Icon_Blob2', 'Icon_Blob3', 'Icon_Boot', 'Icon_Cat', 'Icon_HelloThere',
      'Icon_KeyShort', 'Icon_Smiley', 'Icon_Swirl', 'Icon_Trojan', 'Icon_TV', 'Icon_USB', 'Lines0', 'Lines1',
      'Lines2', 'Lines3', 'Square1', 'Square2', 'Square3', 'Square4', 'Square5', 'Star'].map(n => `Icons_Deco/${n}`),
    pattern: ['Pattern0', 'Pattern1', 'Pattern2', 'Pattern3', 'Pattern_Boxes', 'Pattern_Datenklo1',
      'Pattern_Datenklo2', 'Pattern_Dots', 'Pattern_Lime', 'Pattern_Mouse', 'Pattern_Oscilloscope'].map(n => `Patterns/${n}`),
    logo: ['Logos/40C3_Logo_0'],
    logotext: ['Logos/40C3_LogoText_0'],
  }

  const LIGHT = ['#ebedf0', '#e7edea', '#fff', '#ffffff', '#fffbff']
  const DARK = ['#001300', '#000d00', '#020308', '#000', '#000000']
  function slot(value) {
    const v = (value || '').trim().toLowerCase()
    if (!v || v === 'none') return null
    if (LIGHT.includes(v)) return 'light'
    if (DARK.includes(v)) return 'dark'
    return 'fg'
  }

  // An asset: its size and its content with colours as CSS variables.
  function parse(text) {
    const doc = new DOMParser().parseFromString(text, 'image/svg+xml')
    const root = doc.documentElement
    const [, , w, h] = root.getAttribute('viewBox').split(/[\s,]+/).map(Number)
    const classes = {}
    for (const style of root.querySelectorAll('style')) {
      for (const m of style.textContent.matchAll(/\.([\w-]+)\s*\{([^}]*)\}/g)) {
        const fill = /(?:^|;|\s)fill:\s*([^;]+)/.exec(m[2]), stroke = /stroke:\s*([^;]+)/.exec(m[2])
        classes[m[1]] = { fill: fill && slot(fill[1]), stroke: stroke && slot(stroke[1]) }
      }
    }
    root.querySelectorAll('defs, style, title').forEach(n => n.remove())
    const used = new Set(), styled = []
    for (const node of root.querySelectorAll('*')) {
      node.removeAttribute('id')
      node.removeAttribute('data-name')
      const cls = classes[node.getAttribute('class')] || {}
      node.removeAttribute('class')
      let fill = cls.fill, stroke = cls.stroke
      if (node.hasAttribute('fill')) { fill = slot(node.getAttribute('fill')); node.removeAttribute('fill') }
      if (node.hasAttribute('stroke')) { stroke = slot(node.getAttribute('stroke')); node.removeAttribute('stroke') }
      const shape = /^(path|polygon|circle|ellipse|rect|polyline|line)$/.test(node.localName)
      if (shape && fill === undefined) fill = 'dark'       // SVG default fill: black
      if (fill) used.add(fill)
      if (stroke) used.add(stroke)
      styled.push([node, fill, stroke])
    }
    // drawn only in dark: show it in the foreground colour
    const only = used.size === 1 && used.has('dark') ? 'fg' : null
    for (const [node, fill, stroke] of styled) {
      const css = []
      if (fill) css.push(`fill:var(--c3-${only || fill})`)
      if (stroke) css.push(`stroke:var(--c3-${only || stroke})`)
      if (css.length) node.setAttribute('style', [node.getAttribute('style'), ...css].filter(Boolean).join(';'))
    }
    const inner = [...root.childNodes].map(n => new XMLSerializer().serializeToString(n)).join('')
      .replace(/ xmlns="[^"]*"/g, '')
    return { w, h, inner }
  }

  async function load({ base = DEFAULT_BASE, kinds = Object.keys(FILES) } = {}) {
    const assets = {}
    await Promise.all(kinds.flatMap(k => FILES[k]).map(async name => {
      const res = await fetch(new URL(`${name}.svg`, base))
      if (!res.ok) throw new Error(`assets: ${name}: ${res.status}`)
      assets[name] = parse(await res.text())
    }))

    const names = kind => FILES[kind].filter(n => n in assets)
    const pick = (kind, count = 1, rnd = Math.random) => {
      const pool = names(kind).slice(), out = []
      while (out.length < count && pool.length) out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0])
      return out
    }

    function svg(name, { colors = {} } = {}) {
      const a = assets[name]
      if (!a) throw new Error(`assets: unknown ${name}`)
      const c = { fg: 'var(--accent, #75b44b)', light: 'var(--ink, #ebedf0)', dark: 'var(--bg, #001300)', ...colors }
      const markup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${a.w} ${a.h}" ` +
        `style="--c3-fg:${c.fg};--c3-light:${c.light};--c3-dark:${c.dark}">` +
        `<title>${name.split('/').pop()}</title>${a.inner}</svg>`
      const el = new DOMParser().parseFromString(markup, 'image/svg+xml').documentElement
      el.dataset.asset = name
      return el
    }

    const random = (kind, options) => svg(pick(kind)[0], options)
    return { svg, random, pick, names, size: name => ({ w: assets[name].w, h: assets[name].h }) }
  }

  window.C3Assets = { load, FILES }
})()
