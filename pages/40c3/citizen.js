// Citizen creator: composes a random 40C3 citizen from the parts in
// guides/40c3/Citizen_Creator_Assets (head, hair, eyes, nose, mouth, body, deco).
//
//   <script src="40c3/citizen.js"></script>
//
//   const C = await Citizen.load()            // fetches all parts once
//   const spec = C.random()                    // { head: "Head3", hair: "Hair1", ..., deco: ["Deco5"], seed }
//   const svg = C.svg(spec)                    // an <svg> element, scales to its box
//   el.append(svg)
//
//   C.random(1234)                             // the same citizen for the same seed
//   C.svg(spec, { colors: { green: "#004dff", white: "#fff", black: "#000" } })
//   const img = await Citizen.image(svg)       // as an <img>, e.g. for a canvas
//   Citizen.encode(spec) / Citizen.decode(s)   // "h3.r1.e5.n0.m4.b2.d7+2" for URLs
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
  // head's own size; colour of the face; `scale` enlarges features on small faces;
  // `horn`: how far below the head's top a horn sits (share of the head height), e.g.
  // between ears or on the forehead below an outline; `outline`: thickness of an outline
  // a pair of horns must reach below; `horns: false`: no pair of horns on this head;
  // `hornsX`: where the pair sits instead (share of the head width from its centre), and
  // `hornsTilt`: how much the horns follow the slope of the outline there (0 to 1);
  // `hair`: placement of hair styles that differs on this head (fields as in HAIR);
  // `chin`: the circle of a round face (centre x, lower end y, radius r; shares of the head
  // width/height/width), for the beard;
  // `deco`: placement of decos that differs on this head (fields as in DECO; for a hat on
  // top, `depth` puts its lower edge at that share of the head height);
  // `tiltedAt`: where tilted hats sit instead, for the right side (mirrored for the left):
  // the middle of the brim at `x`, `y` (shares of the head), turned by `angle` degrees.
  const HEADS = {
    Head0: { face: [0.14, 0.08, 0.86, 0.94], skull: [0.5, 0.78], color: 'green' },
    Head1: { face: [0.08, 0.08, 0.92, 0.94], skull: [0.5, 0.84], color: 'green' },
    Head2: { face: [0.06, 0.06, 0.94, 0.94], skull: [0.5, 0.94], color: 'white', tiltedAt: { x: 0.80, y: 0.17, angle: 40 } }, // tilted hats on the corners
    Head3: { face: [0.10, 0.20, 0.90, 0.94], skull: [0.5, 0.80], color: 'black', horn: 0.28, horns: false,
             hair: { Hair0: { width: 0.85, top: -0.12 }, Hair0x: { width: 0.85, top: -0.28 }, Hair2x: { top: -0.06 } } }, // cat: between the ears; its ears are enough; ears out of the hair
    Head4: { face: [0.24, 0.40, 0.76, 0.96], skull: [0.5, 0.22], color: 'white', scale: 1.6, horn: 0.24, hornsX: 0.21, hornsTilt: 0.55, // horns on the sides, tilted
             hair: { Hair2: { top: -0.05 } }, // the crown sunk onto the tip
             deco: { Deco7: { depth: 0.19 }, Deco5: { depth: 0.14 }, Deco1: { depth: 0.12 } } }, // small hats: pointed hat's brim on the edges, hat and cap lower, tip just hidden
    Head5: { face: [0.10, 0.04, 0.90, 0.64], skull: [0.5, 0.80], color: 'white' },
    Head6: { face: [0.08, 0.06, 0.92, 0.94], skull: [0.5, 0.84], color: 'white' },
    Head7: { face: [0.10, 0.06, 0.90, 0.68], skull: [0.5, 0.84], color: 'black', horn: 0.07, outline: 0.035,
             chin: { x: 0.5, y: 0.722, r: 0.5 } }, // horn below the outline; the face circle (with outline), measured
  }

  // Features: centre in the face box (fractions), size as part width per face width at the
  // reference size (FACE_REF units of face width), height limited to a share of the face.
  const FACE_REF = 760
  const FEATURE_Y = { eyes: 0.36, nose: 0.58, mouth: 0.80 }
  const FEATURE_MAX_H = { eyes: 0.42, nose: 0.34, mouth: 0.42 }

  // Hair: width per skull width, and how far the head's top lies inside the hair (share
  // of the hair's height, from its top); `back` draws it behind the head, `over` in
  // front of the eyes; `part`: a variant of another hair file; `heads`: only on these,
  // `notHeads`: never on these.
  const HAIR = {
    Hair0: { width: 1.10, top: 0.62 },
    Hair1: { width: 0.50, top: 0.82, x: 0.10 },
    Hair2: { width: 1.30, top: 0.80, back: true, heads: ['Head4'] }, // the crown: only on the triangle
    // derived: Hair0 pulled down over the forehead, a bit wider, drawn over the eyes
    Hair0x: { part: 'Hair0', width: 1.16, top: 0.30, over: true },
    // derived: Hair2 lower and wider, behind the head, framing the face
    Hair2x: { part: 'Hair2', width: 1.60, top: 0.32, back: true, notHeads: ['Head4'] }, // the triangle has Hair2t
    // derived: Hair2 big and low behind the triangle, only the spikes show beside it
    Hair2t: { part: 'Hair2', width: 4.8, top: -0.10, back: true, heads: ['Head4'] },
    // derived: Hair1 as big as on the square head, on the triangle's forehead
    Hair1t: { part: 'Hair1', width: 1.3, top: -0.2, x: 0.10, heads: ['Head4'] },
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
  //   horns: a pair, see Deco8x2
  //   eye: over the right eye (as seen) of the eyes part, or the left one with `side`: `lens` is the centre and width
  //        of the patch's lens as fractions of the part, `cover` the lens width per eye
  //        size (kept between `min` and `max` of the face width), so it fits whatever
  //        head and eyes it is combined with
  // `slot`: a citizen has at most one deco per slot (one hat, one thing on the eyes).
  const DECO = {
    // pointed ears with earrings: the part holds both; each half is set against the
    // head's side at eye height, behind it. `height`: the part's height per face width
    // (with the head's feature scale), `attach`: the height (share of the part) where an
    // ear meets the head, `overlap`: how far it reaches behind the head (share of the
    // head width)
    Deco0: { slot: 'ears', at: 'ears', height: 0.62, attach: 0.18, overlap: 0.05, notHeads: ['Head0'] }, // Head0 has ears
    Deco1: { slot: 'top', at: 'top', width: 1.05, sink: 0.45 },                // cap
    Deco2: { slot: 'eyes', at: 'eye', lens: [0.5, 0.5, 1.0], cover: 1.7, min: 0.26, max: 0.36 }, // monocle
    Deco3: { slot: 'mouth', at: 'face', x: 0.5, y: 0.69, width: 0.55 },        // moustache
    // raised fist: standing on the left shoulder (as seen) at `x` of the body's width,
    // `sink` of its height into the body, tilted by `tilt` of the shoulder's slope; behind
    // the head. Without a body, beside the head.
    Deco4: { slot: 'side', at: 'side', height: 0.48, x: 0.08, sink: 0.12, tilt: 0.8 },
    Deco5: { slot: 'top', at: 'top', width: 1.15, sink: 0.30 },                // hat
    Deco6: { slot: 'eyes', at: 'face', x: 0.5, y: 0.36, width: 0.98 },         // glasses
    Deco7: { slot: 'top', at: 'top', width: 0.95, sink: 0.22 },                // pointed hat
    Deco8: { slot: 'top', at: 'top', height: 0.55, sink: 0.08, horn: true },   // horn
    Deco8m: { slot: 'top', at: 'top', height: 0.55, sink: 0.08, horn: true, part: 'Deco8', flip: true }, // the horn mirrored
    Deco9: { slot: 'eyes', at: 'eye', lens: [0.537, 0.59, 0.61], cover: 1.45, min: 0.26, max: 0.36 }, // eye patch
    // derived: the eye patch on the left eye (as seen), mirrored; the monocle on the left eye
    Deco9l: { slot: 'eyes', at: 'eye', part: 'Deco9', side: 'left', flip: true,
              lens: [0.537, 0.59, 0.61], cover: 1.45, min: 0.26, max: 0.36 },
    Deco2l: { slot: 'eyes', at: 'eye', part: 'Deco2', side: 'left',
              lens: [0.5, 0.5, 1.0], cover: 1.7, min: 0.26, max: 0.36 },
    Deco10: { slot: 'cheeks', at: 'face', x: 0.5, y: 0.60, width: 0.92 },      // cheek diamonds
    // derived: two horns from Deco8, the right one mirrored, both pointing outwards; set
    // on the head's outline at `x` (share of the skull width from its centre), `height`
    // per head height, the base corners sunk into the head by `sink` of the head height
    Deco8x2: { slot: 'top', at: 'horns', part: 'Deco8', x: 0.30, height: 0.36, sink: 0.025 },
    // derived: the spiky hair upside down as a beard, over the head, its arch locked to the
    // lower end of the face. The arch of Hair2 is nearly a circle: radius `archR` of the
    // hair's width, apex at `archApex` of its height (from its top, as worn); measured.
    DecoBeard: { slot: 'beard', at: 'beard', part: 'Hair2', heads: ['Head0', 'Head1', 'Head2', 'Head3', 'Head6', 'Head7'],
                 archR: 0.30, archApex: 0.505, behind: { width: 1.5, apex: 0.85 },
                 band: 0.035, bandAngle: [-13.5, -16] }, // band: thickness per head width, its right and left end at these angles (below the horizontal if negative)
    // derived: big hats for the triangle head, pulled down over its tip; `width` per head
    // width, `depth`: where the hat's lower edge sits (share of the head height), `x`: shift
    // by a share of its width. (No big cap: it does not suit the triangle.)
    Deco5x: { slot: 'top', at: 'big', part: 'Deco5', heads: ['Head4'], width: 1.00, depth: 0.40 }, // hat
    Deco7x: { slot: 'top', at: 'big', part: 'Deco7', heads: ['Head4'], width: 0.70, depth: 0.48 }, // pointed hat
    // derived: smaller hats sitting tilted on a side of the head: `width` per skull
    // width, centred at `x` of the skull width right (left if negative) of its middle, following
    // `tilt` of the outline's slope there, the brim sunk in by `sink` of the hat's height
    Deco1t: { slot: 'top', at: 'tilted', part: 'Deco1', notHeads: ['Head4'], width: 0.62, x: 0.24, tilt: 1.0, sink: 0.25 }, // cap
    Deco5t: { slot: 'top', at: 'tilted', part: 'Deco5', notHeads: ['Head4'], width: 0.72, x: 0.24, tilt: 1.0, sink: 0.20 }, // hat
    Deco7t: { slot: 'top', at: 'tilted', part: 'Deco7', notHeads: ['Head4'], width: 0.55, x: 0.24, tilt: 1.0, sink: 0.15 }, // pointed hat
    // the same on the left side, mirrored
    Deco1tl: { slot: 'top', at: 'tilted', part: 'Deco1', notHeads: ['Head4'], width: 0.62, x: -0.24, tilt: 1.0, sink: 0.25, flip: true },
    Deco5tl: { slot: 'top', at: 'tilted', part: 'Deco5', notHeads: ['Head4'], width: 0.72, x: -0.24, tilt: 1.0, sink: 0.20, flip: true },
    Deco7tl: { slot: 'top', at: 'tilted', part: 'Deco7', notHeads: ['Head4'], width: 0.55, x: -0.24, tilt: 1.0, sink: 0.15, flip: true },
  }
  // hair and decos that are not files of their own
  const DERIVED = Object.keys(DECO).filter(n => DECO[n].part)
  const DERIVED_HAIR = Object.keys(HAIR).filter(n => HAIR[n].part)

  const FOLDERS = { head: 'Heads', hair: 'Hair', eyes: 'Eyes', nose: 'Noses', mouth: 'Mouths', body: 'Bodies', deco: 'Deco' }
  const PREFIX = { head: 'Head', hair: 'Hair', eyes: 'Eyes', nose: 'Nose', mouth: 'Mouth', body: 'Body', deco: 'Deco' }
  const COUNT = { head: 8, hair: 3, eyes: 12, nose: 5, mouth: 11, body: 4, deco: 11 }
  const MISSING = { eyes: [3] }                       // there is no Eyes3.svg
  const KEYS = ['head', 'hair', 'eyes', 'nose', 'mouth', 'body', 'deco']
  const OPTIONAL = { hair: 0.7 }                      // chance to have one
  // chance of 0, 1, 2 or 3 decos
  const DECO_COUNT = [0.40, 0.38, 0.16, 0.06]
  // parts that must not meet in one citizen
  const CLASHES = [
    ['Eyes2', 'Nose1'],                               // both two dots: looks like four eyes
  ]
  // mouths that bring their own nose (a beak, a mouth with a nose on it): no nose then
  const NO_NOSE = ['Mouth2', 'Mouth10']
  const clashes = (a, b) => CLASHES.some(([x, y]) => (a === x && b === y) || (a === y && b === x))

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
    await Promise.all([measureEyes(parts), measureTops(parts)])
    return makeCreator(parts)
  }

  // A part drawn at width W in one colour: its alpha values, or null.
  async function raster(part, W) {
    const h = Math.max(1, Math.round(W * part.h / part.w))
    const markup = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${h}" ` +
      `viewBox="0 0 ${part.w} ${part.h}" style="--cc-green:#000;--cc-white:#000;--cc-black:#000">${part.inner}</svg>`
    const img = new Image()
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(markup)
    try { await img.decode() } catch { return null }
    const c = document.createElement('canvas')
    c.width = W; c.height = h
    const g = c.getContext('2d', { willReadFrequently: true })
    g.drawImage(img, 0, 0)
    return { d: g.getImageData(0, 0, W, h).data, h }
  }

  // The outline of each head and body from above: for each of `TOP_COLUMNS` columns, the top of
  // what is drawn there as a share of the head height (null where nothing is).
  const TOP_COLUMNS = 100
  async function measureTops(parts) {
    const W = TOP_COLUMNS
    await Promise.all(names('head').concat(names('body')).map(async name => {
      const r = await raster(parts[name], W)
      if (!r) return
      parts[name].top = Array.from({ length: W }, (_, x) => {
        for (let y = 0; y < r.h; y++) if (r.d[(y * W + x) * 4 + 3] > 40) return y / r.h
        return null
      })
    }))
    // heads from the sides: per row (`TOP_COLUMNS` rows over the height), the left and
    // right edge as shares of the width
    await Promise.all(names('head').map(async name => {
      const part = parts[name], Wr = 400
      const r = await raster(part, Wr)
      if (!r) return
      part.sides = Array.from({ length: TOP_COLUMNS }, (_, i) => {
        const y = Math.min(r.h - 1, Math.floor((i + 0.5) / TOP_COLUMNS * r.h))
        let l = -1, rt = -1
        for (let x = 0; x < Wr; x++) if (r.d[(y * Wr + x) * 4 + 3] > 40) { if (l < 0) l = x; rt = x }
        return l < 0 ? null : [l / Wr, (rt + 1) / Wr]
      })
    }))
    // parts with two halves (the ears): the drawn extent of each half
    for (const name of ['Deco0']) {
      const part = parts[name], Wr = 400
      const r = await raster(part, Wr)
      if (!r) continue
      const extent = (from, to) => {
        let x0 = to, x1 = from - 1
        for (let y = 0; y < r.h; y++) for (let x = from; x < to; x++) {
          if (r.d[(y * Wr + x) * 4 + 3] > 40) { if (x < x0) x0 = x; if (x > x1) x1 = x }
        }
        return [x0 / Wr, (x1 + 1) / Wr]
      }
      part.halves = { left: extent(0, Wr / 2), right: extent(Wr / 2, Wr) }
    }
  }

  // Where the eyes of each eyes part are: the boxes of what is drawn in the part's left
  // and right half (as seen), as fractions of the part. Measured once by drawing the parts.
  async function measureEyes(parts) {
    const W = 400
    await Promise.all(names('eyes').map(async name => {
      const part = parts[name]
      const r = await raster(part, W)
      if (!r) return
      const { d, h } = r
      const box = (from, to) => {
        let x0 = W, y0 = h, x1 = -1, y1 = -1
        for (let y = 0; y < h; y++) for (let x = from; x < to; x++) {
          if (d[(y * W + x) * 4 + 3] > 40) {
            if (x < x0) x0 = x
            if (x > x1) x1 = x
            if (y < y0) y0 = y
            if (y > y1) y1 = y
          }
        }
        return x1 < 0 ? null : { cx: (x0 + x1 + 1) / 2 / W, cy: (y0 + y1 + 1) / 2 / h, w: (x1 - x0 + 1) / W, h: (y1 - y0 + 1) / h }
      }
      part.eye = { left: box(0, W / 2), right: box(W / 2, W) }
    }))
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
    const partOf = name => parts[(HAIR[name] || DECO[name] || {}).part || name]
    const visibleOn = (head, name) => [...partOf(name).colors].some(c => c !== HEADS[head].color)

    // How many decos (DECO_COUNT), each from a slot not taken yet.
    function pickDecos(r, decos) {
      let u = r(), n = 0
      while (n < DECO_COUNT.length - 1 && u >= DECO_COUNT[n]) u -= DECO_COUNT[n++]
      const out = []
      for (let i = 0; i < n; i++) {
        const free = decos.filter(d => !out.some(o => DECO[o].slot === DECO[d].slot))
        if (!free.length) break
        out.push(pick(r, free))
      }
      return out
    }

    function random(seed = Math.floor(Math.random() * 2 ** 32)) {
      const r = rng(seed)
      const head = pick(r, names('head'))
      const chosen = []
      const face = kind => {
        const name = pick(r, names(kind).filter(n => visibleOn(head, n) && !chosen.some(c => clashes(c, n))))
        chosen.push(name)
        return name
      }
      // hair in front of the head and deco on the face must show on it too
      const hairs = names('hair').concat(DERIVED_HAIR)
        .filter(n => HAIR[n].back || visibleOn(head, n))
        .filter(n => !HAIR[n].heads || HAIR[n].heads.includes(head))
        .filter(n => !(HAIR[n].notHeads || []).includes(head))
      const decos = names('deco').concat(DERIVED)
        .filter(n => !['face', 'eye'].includes(DECO[n].at) || visibleOn(head, n))
        .filter(n => DECO[n].at !== 'horns' || HEADS[head].horns !== false)
        .filter(n => !DECO[n].heads || DECO[n].heads.includes(head))
        .filter(n => !(DECO[n].notHeads || []).includes(head))
      const hair = r() < OPTIONAL.hair ? pick(r, hairs) : null
      const eyes = face('eyes')
      const mouth = face('mouth')
      const nose = NO_NOSE.includes(mouth) ? null : face('nose')
      return {
        head,
        hair,
        eyes,
        nose,
        mouth,
        body: pick(r, names('body')),
        deco: pickDecos(r, decos),
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
      // `crop`: only the part between these shares of its width; `w` is then the width of
      // that piece
      const put = (name, x, y, w, layer, flip = false, rotate = null, crop = null) => {
        const p = parts[name], cw = crop ? crop[1] - crop[0] : 1
        placed.push({ name, x, y, w, h: w * p.h / (p.w * cw), layer, flip, rotate, crop })
      }
      const fitWidth = (p, w, maxH) => Math.min(w, maxH * p.w / p.h)

      // body below the head
      let body = null
      if (spec.body) {
        const p = parts[spec.body], B = BODIES[spec.body]
        const w = head.w * B.width, h = w * p.h / p.w
        body = { part: p, x: head.w / 2 - w / 2, y: head.h - B.overlap * h, w, h }
        put(spec.body, body.x, body.y, w, 0)
      }
      // hair: behind or in front of the head
      if (spec.hair) {
        const R = { ...HAIR[spec.hair], ...(H.hair || {})[spec.hair] }, p = parts[R.part || spec.hair]
        const w = skullW * R.width, h = w * p.h / p.w
        put(R.part || spec.hair, skullX - w / 2 + (R.x || 0) * skullW, -R.top * h, w, R.back ? 1 : R.over ? 4.5 : 3)
      }
      put(spec.head, 0, 0, head.w, 2)
      // features in the face box
      const s = fw / FACE_REF * (H.scale || 1)
      const eye = {}
      for (const kind of ['eyes', 'nose', 'mouth']) {
        const name = spec[kind]
        if (!name) continue
        const p = parts[name]
        const w = fitWidth(p, Math.min(p.w * s, fw * 0.96), fh * FEATURE_MAX_H[kind])
        const h = w * p.h / p.w
        const x = fx0 + fw / 2 - w / 2, y = fy0 + fh * FEATURE_Y[kind] - h / 2
        put(name, x, y, w, 4)
        if (kind === 'eyes' && p.eye) {
          for (const side of ['left', 'right']) {
            const e = p.eye[side]
            if (e) eye[side] = { cx: x + e.cx * w, cy: y + e.cy * h, size: Math.max(e.w * w, e.h * h) }
          }
        }
      }
      // the head's top at a point (share of its width), from the measured outline
      const topAt = f => {
        const t = head.top && head.top[Math.max(0, Math.min(TOP_COLUMNS - 1, Math.floor(f * TOP_COLUMNS)))]
        return (t ?? 0) * head.h
      }
      // decos (a single name is accepted too)
      for (const deco of [].concat(spec.deco || [])) {
        const D = { ...DECO[deco], ...(H.deco || {})[deco] }, p = parts[D.part || deco]
        if (D.at === 'beard' && !H.chin) {
          // heads without a neck: behind the head, the arch hidden by it; `behind`: width per
          // head width and where the arch's apex lies (share of the head height)
          const B = { ...D.behind, ...(H.beard || {}) }
          const w = head.w * B.width, h = w * p.h / p.w
          put(D.part, head.w / 2 - w / 2, head.h * B.apex - (1 - D.archApex) * h, w, 1.8, 'v')
          continue
        }
        if (D.at === 'beard') {
          // over the head, the arch locked to the face line: sized so the arch's circle is
          // the face's circle, its apex on the chin
          const C = H.chin || { x: 0.5, y: (fy0 + fh) / head.h, r: fw / 2 / head.w }
          const T = D
          const w = C.r * head.w / T.archR, h = w * p.h / p.w
          put(D.part, C.x * head.w - w / 2, C.y * head.h - (1 - T.archApex) * h, w, 3, 'v')
          // where the arch ends, the outer spikes leave the face at an angle: a band along
          // the face line under the beard closes the gap there
          if (T.band) {
            const R0 = C.r * head.w * 0.97, R1 = R0 + T.band * head.w
            const cx = C.x * head.w, cy = C.y * head.h - C.r * head.w
            // from right to left, below; each end at its own angle (the hair is not symmetric)
            const [ar, al] = Array.isArray(T.bandAngle) ? T.bandAngle : [T.bandAngle, T.bandAngle]
            const a0 = -ar * Math.PI / 180, a1 = Math.PI + al * Math.PI / 180
            const pt = (R, a) => `${(cx + R * Math.cos(a)).toFixed(2)} ${(cy + R * Math.sin(a)).toFixed(2)}`
            const large = a1 - a0 > Math.PI ? 1 : 0
            const d = `M${pt(R1, a0)} A${R1} ${R1} 0 ${large} 1 ${pt(R1, a1)} L${pt(R0, a1)} A${R0} ${R0} 0 ${large} 0 ${pt(R0, a0)} Z`
            placed.push({ markup: `<path d="${d}" style="fill:var(--cc-green)"/>`, x: cx - R1, y: cy - R1, w: 2 * R1, h: 2 * R1, layer: 2.9 })
          }
          continue
        }
        if (D.at === 'ears' && head.sides && p.halves) {
          const s = D.height * fw * (H.scale || 1) / p.h     // part units to head units
          const at = eye.right ? eye.right.cy : fy0 + fh * FEATURE_Y.eyes
          const top = at - D.attach * p.h * s
          const row = Math.max(0, Math.min(TOP_COLUMNS - 1, Math.floor(at / head.h * TOP_COLUMNS)))
          const [hl, hr] = head.sides[row] || [0, 1]
          for (const side of ['left', 'right']) {
            const crop = p.halves[side], w = (crop[1] - crop[0]) * p.w * s
            const x = side === 'left' ? hl * head.w + D.overlap * head.w - w : hr * head.w - D.overlap * head.w
            put(deco, x, top, w, 1.8, false, null, crop)
          }
          continue
        }
        if (D.at === 'horns') {
          // the head's top at a point (share of its width), from the measured outline
          const h = head.h * D.height, w = h * p.w / p.h
          for (const side of [-1, 1]) {
            const cx = H.hornsX != null ? head.w * (0.5 + side * H.hornsX) : skullX + side * D.x * skullW
            const x = cx - w / 2
            const sink = (D.sink + (H.outline || 0)) * head.h
            if (H.hornsTilt) {
              // follow the slope of the outline: tilt about the middle of the base, and sink
              // it so both corners stay below the outline
              const dx = w / 2
              const slope = (topAt((cx + dx) / head.w) - topAt((cx - dx) / head.w)) / (2 * dx)
              const a = Math.atan(slope) * H.hornsTilt
              const base = topAt(cx / head.w) + sink + dx * Math.abs(Math.sin(a) - slope * Math.cos(a))
              put(D.part, x, base - h, w, 5, side > 0, { a: a * 180 / Math.PI, cx, cy: base })
              continue
            }
            // both base corners in the head: below the outline where it is lowest
            const base = Math.max(topAt(x / head.w), topAt((x + w) / head.w)) + sink
            // the part points left; the right one is mirrored
            put(D.part, x, base - h, w, 5, side > 0)
          }
          continue
        }
        let w, x, y
        if (D.at === 'top') {
          w = D.width ? skullW * D.width : D.height * head.h * p.w / p.h
          const h = w * p.h / p.w
          x = skullX - w / 2; y = D.depth != null ? D.depth * head.h - h : -(1 - D.sink) * h
          // lower on heads that say so (between ears, below an outline)
          if (D.horn && H.horn) y += H.horn * head.h
        } else if (D.at === 'tilted') {
          w = skullW * D.width
          if (H.tiltedAt) {
            // a fixed spot, e.g. on a corner
            const T = H.tiltedAt, right = D.x > 0
            const cx = head.w * (right ? T.x : 1 - T.x), base = head.h * T.y, h = w * p.h / p.w
            put(D.part, cx - w / 2, base - h, w, 5, !!D.flip, { a: right ? T.angle : -T.angle, cx, cy: base })
            continue
          }
          const h = w * p.h / p.w, cx = skullX + D.x * skullW, dx = w / 2
          const slope = (topAt((cx + dx) / head.w) - topAt((cx - dx) / head.w)) / (2 * dx)
          const a = Math.atan(slope) * D.tilt
          // the brim's middle on the outline; deep enough that both ends touch the head
          const base = topAt(cx / head.w) + D.sink * h + dx * Math.abs(Math.sin(a) - slope * Math.cos(a)) * 0.5
          put(D.part, cx - w / 2, base - h, w, 5, !!D.flip, { a: a * 180 / Math.PI, cx, cy: base })
          continue
        } else if (D.at === 'big') {
          w = head.w * D.width
          x = head.w / 2 - w / 2 + (D.x || 0) * w; y = D.depth * head.h - w * p.h / p.w
        } else if (D.at === 'face') {
          w = fw * D.width
          x = fx0 + fw * D.x - w / 2; y = fy0 + fh * D.y - (w * p.h / p.w) / 2
        } else if (D.at === 'eye') {
          const [lx, ly, lw] = D.lens
          // without a measured eye: where the right eye usually is
          const left = D.side === 'left'
          const e = eye[left ? 'left' : 'right'] ||
            { cx: fx0 + fw * (left ? 0.32 : 0.68), cy: fy0 + fh * FEATURE_Y.eyes, size: fw * 0.22 }
          // the lens covers the eye, but stays within a sensible share of the face (with
          // the head's feature scale); never smaller than the eye itself
          const fs = fw * (H.scale || 1)
          const lens = Math.max(Math.min(Math.max(e.size * D.cover, fs * D.min), fs * D.max), e.size * 1.15)
          w = lens / lw
          // a mirrored part has its lens mirrored too
          x = e.cx - (D.flip ? 1 - lx : lx) * w; y = e.cy - ly * (w * p.h / p.w)
        } else if (D.at === 'head') {
          w = head.w * D.width
          x = head.w * D.x - w / 2; y = head.h * D.y - (w * p.h / p.w) / 2
        } else if (body && body.part.top) {
          // on the shoulder: the body's outline there, tilted outwards with its slope
          const h = head.h * D.height
          w = h * p.w / p.h
          const topAt = px => {
            const f = Math.max(0, Math.min(TOP_COLUMNS - 1, Math.floor((px - body.x) / body.w * TOP_COLUMNS)))
            return body.y + (body.part.top[f] ?? 1) * body.h
          }
          const cx = body.x + body.w * D.x, dx = body.w * 0.05
          const slope = (topAt(cx + dx) - topAt(cx - dx)) / (2 * dx)
          const a = Math.atan(slope) * D.tilt
          const base = topAt(cx) + D.sink * h
          put(D.part || deco, cx - w / 2, base - h, w, 1.5, false, { a: a * 180 / Math.PI, cx, cy: base })
          continue
        } else {
          const h = head.h * D.height
          w = h * p.w / p.h
          x = -w * 0.75; y = head.h * 1.05 - h
        }
        put(D.part || deco, x, y, w, 5, !!D.flip)
      }
      return placed.sort((a, b) => a.layer - b.layer)
    }

    // The citizen as <svg>, its viewBox around all parts with some padding.
    // `label`: a short text written on the body (e.g. the seed, to point a citizen out).
    function svg(spec, { colors = {}, padding = 0.04, label = null } = {}) {
      const placed = layout(spec)
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
      for (const p of placed) {
        // corners, turned with the part if it is rotated
        const t = p.rotate ? p.rotate.a * Math.PI / 180 : 0, cos = Math.cos(t), sin = Math.sin(t)
        for (const [px, py] of [[p.x, p.y], [p.x + p.w, p.y], [p.x, p.y + p.h], [p.x + p.w, p.y + p.h]]) {
          const x = p.rotate ? p.rotate.cx + (px - p.rotate.cx) * cos - (py - p.rotate.cy) * sin : px
          const y = p.rotate ? p.rotate.cy + (px - p.rotate.cx) * sin + (py - p.rotate.cy) * cos : py
          x0 = Math.min(x0, x); y0 = Math.min(y0, y)
          x1 = Math.max(x1, x); y1 = Math.max(y1, y)
        }
      }
      // square box, so citizens line up in grids
      const side = Math.max(x1 - x0, y1 - y0) * (1 + 2 * padding)
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2
      const c = { ...ORIGINAL, ...colors }
      const r = n => Math.round(n * 100) / 100
      const body = placed.map(p => {
        if (p.markup) return p.markup
        const part = parts[p.name]
        const inner = p.flip === 'v' ? `<g transform="matrix(1 0 0 -1 0 ${part.h})">${part.inner}</g>`
          : p.flip ? `<g transform="matrix(-1 0 0 1 ${part.w} 0)">${part.inner}</g>` : part.inner
        const vb = p.crop ? `${r(p.crop[0] * part.w)} 0 ${r((p.crop[1] - p.crop[0]) * part.w)} ${part.h}` : `0 0 ${part.w} ${part.h}`
        const el = `<svg x="${r(p.x)}" y="${r(p.y)}" width="${r(p.w)}" height="${r(p.h)}" ` +
          `viewBox="${vb}" preserveAspectRatio="none" overflow="${p.crop ? 'hidden' : 'visible'}">${inner}</svg>`
        return p.rotate ? `<g transform="rotate(${r(p.rotate.a)} ${r(p.rotate.cx)} ${r(p.rotate.cy)})">${el}</g>` : el
      }).join('') + labelMarkup(spec, placed, label, r)
      const markup = `<svg xmlns="http://www.w3.org/2000/svg" ` +
        `viewBox="${r(cx - side / 2)} ${r(cy - side / 2)} ${r(side)} ${r(side)}" ` +
        `style="--cc-green:${c.green};--cc-white:${c.white};--cc-black:${c.black};fill:var(--cc-black)">` +
        `<title>Citizen ${encode(spec)}</title>${body}</svg>`
      return new DOMParser().parseFromString(markup, 'image/svg+xml').documentElement
    }

    // The label in the middle of the body's part below the head, white with a black edge.
    function labelMarkup(spec, placed, label, r) {
      if (label == null || label === '') return ''
      const head = placed.find(p => p.name === spec.head)
      const body = placed.find(p => p.name === spec.body && p.layer === 0)
      const x0 = body ? body.x : head.x, w = body ? body.w : head.w
      const top = head.y + head.h, bottom = body ? Math.max(top, body.y + body.h) : top + head.h * 0.3
      const size = Math.min(w * 0.13, Math.max(bottom - top, head.h * 0.12) * 0.55)
      const y = body ? (top + bottom) / 2 : top + size
      const text = String(label).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      return `<text x="${r(x0 + w / 2)}" y="${r(y)}" font-size="${r(size)}" font-family="monospace" ` +
        `text-anchor="middle" dominant-baseline="central" fill="#fff" stroke="#000" ` +
        `stroke-width="${r(size * 0.18)}" paint-order="stroke" stroke-linejoin="round">${text}</text>`
    }

    return { random, svg, layout, parts, names }
  }

  // ---------- helpers ----------
  const LETTER = { head: 'h', hair: 'r', eyes: 'e', nose: 'n', mouth: 'm', body: 'b', deco: 'd' }
  const encode = spec => KEYS.map(k => {
    const list = [].concat(spec[k] || [])
    return LETTER[k] + (list.length ? list.map(n => n.slice(PREFIX[k].length)).join('+') : '-')
  }).join('.')

  function decode(text) {
    const spec = {}
    for (const token of String(text).split('.')) {
      const kind = KEYS.find(k => LETTER[k] === token[0])
      if (!kind) continue
      const n = token.slice(1)
      if (kind === 'deco') spec.deco = n === '-' || n === '' ? [] : n.split('+').map(d => PREFIX.deco + d)
      else spec[kind] = n === '-' || n === '' ? null : PREFIX[kind] + n
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
