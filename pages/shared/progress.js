// Progress bar that fills over the page's display time.
//
// The display time is passed as ?duration=, in the same format as in
// screen.toml: a whole number with ms, s, m or h, e.g. "5s" or "1500ms".
// Without a valid duration, no bar is shown.
(() => {
  const UNITS = { ms: 1, s: 1000, m: 60000, h: 3600000 }

  function parseDuration(value) {
    const match = /^(\d+)(ms|s|m|h)$/.exec(value || "")
    if (!match) return null
    const ms = Number(match[1]) * UNITS[match[2]]
    return ms > 0 ? ms : null
  }

  const duration = parseDuration(new URLSearchParams(location.search).get("duration"))
  if (!duration) return

  const bar = document.createElement("div")
  bar.className = "progress"
  bar.style.transitionDuration = `${duration}ms`
  document.body.appendChild(bar)

  // Start on the next frame, so the transition runs from 0 to full width.
  requestAnimationFrame(() => requestAnimationFrame(() => bar.classList.add("running")))
})()
