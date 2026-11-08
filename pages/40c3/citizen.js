// Citizen creator: composes a random 40C3 citizen from the parts in
// guides/40c3/Citizen_Creator_Assets (head, hair, eyes, nose, mouth, body, deco).
//
//   <script src="40c3/citizen.js"></script>
//
//   const C = await Citizen.load()            // fetches all parts once
//   const spec = C.random()                    // { head: "Head3", hair: "Hair1", ..., seed }
//   const svg = C.svg(spec)                    // an <svg> element, scales to its box
//   el.append(svg)
//
//   C.random(1234)                             // the same citizen for the same seed
//   C.svg(spec, { colors: { green: "#004dff", white: "#fff", black: "#000" } })
//   const img = await Citizen.image(svg)       // as an <img>, e.g. for a canvas
//   Citizen.encode(spec) / Citizen.decode(s)   // "h3.r1.e5.n0.m4.b2.d7" for URLs
//
// The parts have no common coordinate system (each SVG is cropped to its content), so
// every part has a placement below: a face box for heads, and for the other parts an
// anchor relative to the head and its face box. Features are scaled with the face, hair
// and hats with the skull, bodies with the head.
//
// Colours: the parts use three colours (green, white, black). They are mapped to the CSS
// variables --cc-green, --cc-white and --cc-black on the root <svg>, so a citizen can be
// recoloured with `colors` or later with CSS. A feature is only combined with a head if
// it has a colour other than the head's, so nothing disappears on the face.
(() => {
  'use strict'

  const DEFAULT_BASE = new URL('../guides/40c3/Citizen_Creator_Assets/', document.currentScript.src)
  const ORIGINAL = { green: '#6ab143', white: '#fffbff', black: '#000000' }

  // ---------- placement ----------
  // Heads: face box [x0, y0, x1, y1] and skull (top centre x, width) as fractions of the
  // head's own size; colour of the face; `scale` enlarges features on small faces.
  const HEADS = {
    Head0: { face: [0.14, 0.08, 0.86, 0.94], skull: [0.5, 0.78], color: 'green' },
    Head1: { face: [0.08, 0.08, 0.92, 0.94], skull: [0.5, 0.84], color: 'green' },
    Head2: { face: [0.06, 0.06, 0.94, 0.94], skull: [0.5, 0.94], color: 'white' },
    Head3: { face: [0.10, 0.20, 0.90, 0.94], skull: [0.5, 0.80], color: 'black' },
    Head4: { face: [0.24, 0.40, 0.76, 0.96], skull: [0.5, 0.22], color: 'white', scale: 1.6 },
    Head5: { face: [0.10, 0.04, 0.90, 0.64], skull: [0.5, 0.80], color: 'white' },
    Head6: { face: [0.08, 0.06, 0.92, 0.94], skull: [0.5, 0.84], color: 'white' },
    Head7: { face: [0.10, 0.06, 0.90, 0.68], skull: [0.5, 0.84], color: 'black' },
  }

  // Features: centre in the face box (fractions), size as part width per face width at the
  // reference size (FACE_REF units of face width), height limited to a share of the face.
  const FACE_REF = 760
  const FEATURE_Y = { eyes: 0.36, nose: 0.58, mouth: 0.80 }
  const FEATURE_MAX_H = { eyes: 0.42, nose: 0.34, mouth: 0.42 }

  // Hair: width per skull width, and how far the head's top lies inside the hair (share
  // of the hair's height, from its top); `back` draws it behind the head.
  const HAIR = {
    Hair0: { width: 1.10, top: 0.62 },
    Hair1: { width: 0.50, top: 0.82, x: 0.10 },
    Hair2: { width: 1.30, top: 0.80, back: true },
  }

  // Bodies: width per head width; the head's bottom lies this share into the body.
  const BODIES = {
    Body0: { width: 1.05, overlap: 0.22 },
    Body1: { width: 1.05, overlap: 0.30 },
    Body2: { width: 0.90, overlap: 0.25 },
    Body3: { width: 1.10, overlap: 0.25 },
  }

  // Deco, by where it goes:
  //   top: on the skull, width per skull width (or height per head height), sunk in by `sink`
  //   eyes / face: centre in the face box, width per face width
  //   head: centre and width relative to the whole head
  //   side: beside the head, height per head height
  const DECO = {
    Deco0: { at: 'head', x: 0.5, y: 0.62, width: 1.12 },          // earrings
    Deco1: { at: 'top', width: 1.05, sink: 0.45 },                 // cap
    Deco2: { at: 'face', x: 0.70, y: 0.36, width: 0.30 },          // monocle
    Deco3: { at: 'face', x: 0.5, y: 0.69, width: 0.55 },           // moustache
    Deco4: { at: 'side', height: 0.70 },                           // raised fist
    Deco5: { at: 'top', width: 1.15, sink: 0.30 },                 // hat
    Deco6: { at: 'face', x: 0.5, y: 0.36, width: 0.98 },           // glasses
    Deco7: { at: 'top', width: 0.95, sink: 0.22 },                 // pointed hat
    Deco8: { at: 'top', height: 0.55, sink: 0.08 },                // horn
    Deco9: { at: 'face', x: 0.56, y: 0.30, width: 0.80 },          // eye patch
    Deco10: { at: 'face', x: 0.5, y: 0.60, width: 0.92 },          // cheek diamonds
  }

  const FOLDERS = { head: 'Heads', hair: 'Hair', eyes: 'Eyes', nose: 'Noses', mouth: 'Mouths', body: 'Bodies', deco: 'Deco' }
  const PREFIX = { head: 'Head', hair: 'Hair', eyes: 'Eyes', nose: 'Nose', mouth: 'Mouth', body: 'Body', deco: 'Deco' }
  const COUNT = { head: 8, hair: 3, eyes: 12, nose: 5, mouth: 11, body: 4, deco: 11 }
  const MISSING = { eyes: [3] }                       // there is no Eyes3.svg
  const KEYS = ['head', 'hair', 'eyes', 'nose', 'mouth', 'body', 'deco']
  const OPTIONAL = { hair: 0.7, deco: 0.6 }           // chance to have one

  const names = kind => {
    const out = []
    for (let i = 0; i < COUNT[kind]; i++) if (!(MISSING[kind] || []).includes(i)) out.push(PREFIX[kind] + i)
    return out
  }

  // ---------- loading ----------
  // A part: its size (viewBox), its content as markup with colours as CSS variables, and
  // the colours it uses.
  function colorName(value) {
    const v = (value || '').trim().toLowerCase()
    if (!v || v === 'none') return null
    if (v === '#6ab143' || v === '#75b44b') return 'green'
    if (v === '#fffbff' || v === '#fff' || v === '#ffffff' || v === '#ebedf0') return 'white'
    return 'black'
  }

  function parsePart(text) {
    const doc = new DOMParser().parseFromString(text, 'image/svg+xml')
    const root = doc.documentElement
    const [, , w, h] = root.getAttribute('viewBox').split(/[\s,]+/).map(Number)
    const classes = {}
    for (const style of root.querySelectorAll('style')) {
      for (const m of style.textContent.matchAll(/\.([\w-]+)\s*\{([^}]*)\}/g)) {
        const fill = /fill:\s*([^;]+)/.exec(m[2])
        if (fill) classes[m[1]] = colorName(fill[1])
      }
    }
    root.querySelectorAll('defs, style, title').forEach(n => n.remove())
    const used = new Set()
    for (const node of root.querySelectorAll('*')) {
      node.removeAttribute('id')
      node.removeAttribute('data-name')
      let color
      const cls = node.getAttribute('class')
      if (cls) { color = classes[cls]; node.removeAttribute('class') }
      if (node.hasAttribute('fill')) { color = colorName(node.getAttribute('fill')); node.removeAttribute('fill') }
      if (color) node.setAttribute('style', `fill:var(--cc-${color})`)
      if (/^(path|polygon|circle|ellipse|rect|polyline|line)$/.test(node.localName)) used.add(color || 'black')
    }
    const inner = [...root.childNodes].map(n => new XMLSerializer().serializeToString(n)).join('')
      .replace(/ xmlns="[^"]*"/g, '')
    return { w, h, inner, colors: used }
  }

  async function load({ base = DEFAULT_BASE } = {}) {
    const parts = {}
    await Promise.all(KEYS.flatMap(kind => names(kind).map(async name => {
      const res = await fetch(new URL(`${FOLDERS[kind]}/${name}.svg`, base))
      if (!res.ok) throw new Error(`citizen: ${name}: ${res.status}`)
      parts[name] = parsePart(await res.text())
    })))
    return makeCreator(parts)
  }

  // ---------- random ----------
  function rng(seed) {
    let a = seed >>> 0
    return () => {
      a = (a + 0x6d2b79f5) >>> 0
      let t = a
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }

  function makeCreator(parts) {
    const pick = (r, list) => list[Math.floor(r() * list.length)]
    // visible on the face: some colour that is not the face's
    const visibleOn = (head, name) => [...parts[name].colors].some(c => c !== HEADS[head].color)

    function random(seed = Math.floor(Math.random() * 2 ** 32)) {
      const r = rng(seed)
      const head = pick(r, names('head'))
      const face = kind => pick(r, names(kind).filter(n => visibleOn(head, n)))
      // hair in front of the head and deco on the face must show on it too
      const hairs = names('hair').filter(n => HAIR[n].back || visibleOn(head, n))
      const decos = names('deco').filter(n => DECO[n].at !== 'face' || visibleOn(head, n))
      return {
        head,
        hair: r() < OPTIONAL.hair ? pick(r, hairs) : null,
        eyes: face('eyes'),
        nose: face('nose'),
        mouth: face('mouth'),
        body: pick(r, names('body')),
        deco: r() < OPTIONAL.deco ? pick(r, decos) : null,
        seed,
      }
    }

    // Places every part in head units (the head at 0,0 with its own size).
    function layout(spec) {
      const head = parts[spec.head], H = HEADS[spec.head]
      const fx0 = H.face[0] * head.w, fy0 = H.face[1] * head.h
      const fw = (H.face[2] - H.face[0]) * head.w, fh = (H.face[3] - H.face[1]) * head.h
      const skullX = H.skull[0] * head.w, skullW = H.skull[1] * head.w
      const placed = []
      const put = (name, x, y, w, layer) => {
        const p = parts[name]
        placed.push({ name, x, y, w, h: w * p.h / p.w, layer })
      }
      const fitWidth = (p, w, maxH) => Math.min(w, maxH * p.w / p.h)

      // body below the head
      if (spec.body) {
        const p = parts[spec.body], B = BODIES[spec.body]
        const w = head.w * B.width, h = w * p.h / p.w
        put(spec.body, head.w / 2 - w / 2, head.h - B.overlap * h, w, 0)
      }
      // hair: behind or in front of the head
      if (spec.hair) {
        const p = parts[spec.hair], R = HAIR[spec.hair]
        const w = skullW * R.width, h = w * p.h / p.w
        put(spec.hair, skullX - w / 2 + (R.x || 0) * skullW, -R.top * h, w, R.back ? 1 : 3)
      }
      put(spec.head, 0, 0, head.w, 2)
      // features in the face box
      const s = fw / FACE_REF * (H.scale || 1)
      for (const kind of ['eyes', 'nose', 'mouth']) {
        const name = spec[kind]
        if (!name) continue
        const p = parts[name]
        const w = fitWidth(p, Math.min(p.w * s, fw * 0.96), fh * FEATURE_MAX_H[kind])
        const h = w * p.h / p.w
        put(name, fx0 + fw / 2 - w / 2, fy0 + fh * FEATURE_Y[kind] - h / 2, w, 4)
      }
      // deco
      if (spec.deco) {
        const p = parts[spec.deco], D = DECO[spec.deco]
        let w, x, y
        if (D.at === 'top') {
          w = D.width ? skullW * D.width : D.height * head.h * p.w / p.h
          const h = w * p.h / p.w
          x = skullX - w / 2; y = -(1 - D.sink) * h
        } else if (D.at === 'face') {
          w = fw * D.width
          x = fx0 + fw * D.x - w / 2; y = fy0 + fh * D.y - (w * p.h / p.w) / 2
        } else if (D.at === 'head') {
          w = head.w * D.width
          x = head.w * D.x - w / 2; y = head.h * D.y - (w * p.h / p.w) / 2
        } else {
          const h = head.h * D.height
          w = h * p.w / p.h
          x = -w * 0.75; y = head.h * 1.05 - h
        }
        put(spec.deco, x, y, w, 5)
      }
      return placed.sort((a, b) => a.layer - b.layer)
    }

    // The citizen as <svg>, its viewBox around all parts with some padding.
    function svg(spec, { colors = {}, padding = 0.04 } = {}) {
      const placed = layout(spec)
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
      for (const p of placed) {
        x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y)
        x1 = Math.max(x1, p.x + p.w); y1 = Math.max(y1, p.y + p.h)
      }
      // square box, so citizens line up in grids
      const side = Math.max(x1 - x0, y1 - y0) * (1 + 2 * padding)
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2
      const c = { ...ORIGINAL, ...colors }
      const r = n => Math.round(n * 100) / 100
      const body = placed.map(p => {
        const part = parts[p.name]
        return `<svg x="${r(p.x)}" y="${r(p.y)}" width="${r(p.w)}" height="${r(p.h)}" ` +
          `viewBox="0 0 ${part.w} ${part.h}" preserveAspectRatio="none" overflow="visible">${part.inner}</svg>`
      }).join('')
      const markup = `<svg xmlns="http://www.w3.org/2000/svg" ` +
        `viewBox="${r(cx - side / 2)} ${r(cy - side / 2)} ${r(side)} ${r(side)}" ` +
        `style="--cc-green:${c.green};--cc-white:${c.white};--cc-black:${c.black};fill:var(--cc-black)">` +
        `<title>Citizen ${encode(spec)}</title>${body}</svg>`
      return new DOMParser().parseFromString(markup, 'image/svg+xml').documentElement
    }

    return { random, svg, layout, parts, names }
  }

  // ---------- helpers ----------
  const LETTER = { head: 'h', hair: 'r', eyes: 'e', nose: 'n', mouth: 'm', body: 'b', deco: 'd' }
  const encode = spec => KEYS.map(k => LETTER[k] + (spec[k] ? spec[k].slice(PREFIX[k].length) : '-')).join('.')

  function decode(text) {
    const spec = {}
    for (const token of String(text).split('.')) {
      const kind = KEYS.find(k => LETTER[k] === token[0])
      if (!kind) continue
      const n = token.slice(1)
      spec[kind] = n === '-' || n === '' ? null : PREFIX[kind] + n
    }
    return spec
  }

  // An <img> of a citizen, e.g. to draw on a canvas.
  function image(svgElement) {
    const blob = new Blob([new XMLSerializer().serializeToString(svgElement)], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.src = url
    return img.decode().then(() => { URL.revokeObjectURL(url); return img })
  }

  window.Citizen = { load, encode, decode, image, ORIGINAL }
})()
