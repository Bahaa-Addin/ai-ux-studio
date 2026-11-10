/**
 * Tips: the geometry behind the coach marks (voice-guide ADR-0045). Pure functions, checked by
 * `npm test`: where a popover goes beside the control it points at, and the scrim's shape with
 * holes for that control and for anything that must never be covered (Vodafone's accessibility
 * button, voice-guide AGENTS.md §4.6).
 */

/** { left, top, width, height } from a DOMRect-like box. */
export const box = (r) => (r ? { left: r.left, top: r.top, width: r.width, height: r.height } : null)

export const inflate = (r, pad) => ({ left: r.left - pad, top: r.top - pad, width: r.width + pad * 2, height: r.height + pad * 2 })

export const overlaps = (a, b) =>
  Boolean(a && b) && a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height

export const clamp = (value, min, max) => Math.min(Math.max(value, min), Math.max(min, max))

/**
 * Places a popover of size `pop` next to `target` inside `viewport`, on the first side in
 * `prefer` where it fits whole without covering any rect in `avoid` (moving out by up to
 * `maxNudge` px to clear one). Falls back to the side with the most room. Returns its top-left,
 * the side, and where the arrow meets the edge (px along it).
 */
export const placePopover = (target, pop, viewport, { gap = 14, margin = 12, prefer = ['top', 'bottom', 'left', 'right'], avoid = [], maxNudge = 72 } = {}) => {
  const cx = target.left + target.width / 2
  const cy = target.top + target.height / 2
  const room = {
    top: target.top - margin,
    bottom: viewport.height - (target.top + target.height) - margin,
    left: target.left - margin,
    right: viewport.width - (target.left + target.width) - margin,
  }
  const at = (side) => {
    let x
    let y
    if (side === 'top' || side === 'bottom') {
      x = clamp(cx - pop.width / 2, margin, viewport.width - margin - pop.width)
      y = side === 'top' ? target.top - gap - pop.height : target.top + target.height + gap
    } else {
      y = clamp(cy - pop.height / 2, margin, viewport.height - margin - pop.height)
      x = side === 'left' ? target.left - gap - pop.width : target.left + target.width + gap
    }
    return { x, y }
  }
  /** Moves the popover a little further out from the control, past a control in its way. */
  const nudge = (side, base) => {
    let { x, y } = base
    for (let i = 0; i < 4; i += 1) {
      const hit = avoid.find((r) => overlaps({ left: x, top: y, width: pop.width, height: pop.height }, r))
      if (!hit) break
      if (side === 'left') x = hit.left - gap - pop.width
      else if (side === 'right') x = hit.left + hit.width + gap
      else if (side === 'top') y = hit.top - gap - pop.height
      else y = hit.top + hit.height + gap
    }
    return { x, y }
  }
  const fits = (side) => {
    const need = side === 'top' || side === 'bottom' ? pop.height + gap : pop.width + gap
    if (room[side] < need) return false
    const base = at(side)
    const { x, y } = nudge(side, base)
    if (Math.abs(x - base.x) + Math.abs(y - base.y) > maxNudge) return false
    const rect = { left: x, top: y, width: pop.width, height: pop.height }
    return (
      x >= margin - 0.5 &&
      x + pop.width <= viewport.width - margin + 0.5 &&
      y >= margin - 0.5 &&
      y + pop.height <= viewport.height - margin + 0.5 &&
      !avoid.some((r) => overlaps(rect, r))
    )
  }
  const preferred = prefer.find(fits)
  const side = preferred ?? Object.keys(room).sort((a, b) => room[b] - room[a])[0]
  const { x, y } = preferred ? nudge(side, at(side)) : at(side)
  const arrow =
    side === 'top' || side === 'bottom'
      ? clamp(cx - x, 18, pop.width - 18)
      : clamp(cy - y, 18, pop.height - 18)
  return { side, x: Math.round(x), y: Math.round(y), arrow: Math.round(arrow) }
}

/** An SVG path for a rounded rectangle. */
const roundRect = (r, radius) => {
  const rad = Math.max(0, Math.min(radius, r.width / 2, r.height / 2))
  const { left: x, top: y, width: w, height: h } = r
  return `M${x + rad},${y}H${x + w - rad}A${rad},${rad} 0 0 1 ${x + w},${y + rad}V${y + h - rad}A${rad},${rad} 0 0 1 ${x + w - rad},${y + h}H${x + rad}A${rad},${rad} 0 0 1 ${x},${y + h - rad}V${y + rad}A${rad},${rad} 0 0 1 ${x + rad},${y}Z`
}

/** Holes that touch become one (their bounding box), so an overlap is never painted twice. */
export const mergeHoles = (holes) => {
  const out = holes.filter(Boolean).map((hole) => ({ ...hole }))
  for (let merged = true; merged; ) {
    merged = false
    for (let i = 0; i < out.length && !merged; i += 1) {
      for (let j = i + 1; j < out.length && !merged; j += 1) {
        if (!overlaps(out[i], out[j])) continue
        const a = out[i]
        const b = out[j]
        const left = Math.min(a.left, b.left)
        const top = Math.min(a.top, b.top)
        out[i] = {
          left,
          top,
          width: Math.max(a.left + a.width, b.left + b.width) - left,
          height: Math.max(a.top + a.height, b.top + b.height) - top,
          radius: Math.min(a.radius ?? 12, b.radius ?? 12),
        }
        out.splice(j, 1)
        merged = true
      }
    }
  }
  return out
}

/**
 * The scrim: the whole viewport with rounded holes. Drawn with `fill-rule: evenodd`, so the holes
 * are not painted and clicks in them reach the page.
 */
export const scrimPath = (viewport, holes = []) =>
  [`M0,0H${viewport.width}V${viewport.height}H0Z`, ...mergeHoles(holes).map((hole) => roundRect(hole, hole.radius ?? 12))].join('')
