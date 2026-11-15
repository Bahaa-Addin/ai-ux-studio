/**
 * What the Pocket's actors keep clear of on Vodafone's own pages (live plan phase 3 S12): the fixed
 * controls that are not ours to move. Vodafone's accessibility button and cookie banner, the Voice
 * Guide's microphone (and its keyboard button and transcript bar while they show), the trail's pill and
 * card, and the Pocket's own button. The actors never lift, cover or restyle any of them (AGENTS.md 4.6); they stand back.
 *
 * Pure geometry (insetForObstacles) and one read of the page (fixedObstacles). Nothing here throws.
 */

/** The Voice Guide's microphone: always there, so always reserved. */
const GUIDE_ALWAYS = ['.vg-mic']
/**
 * Its keyboard button and transcript bar: only while they are shown (visible, opacity above 0.05). Faded
 * out they would hold the mascot 34 px off his place at 1366x900 while the guide is not listening (the
 * lead's decision, S12); while they show, he keeps his 16 px from them.
 */
const GUIDE_WHILE_SHOWN = ['.vg-kbd', '.vg-bar']
/** The trail's: only while they are shown. */
const TRAIL = ['.tr-pill', '.tr-card']

const boxOf = (node) => {
  if (!node || typeof node.getClientRects !== 'function' || !node.getClientRects().length) return null
  const r = node.getBoundingClientRect()
  if (!(r.width > 0) || !(r.height > 0)) return null
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
}

const shown = (node) => {
  try {
    const style = node.ownerDocument.defaultView.getComputedStyle(node)
    return style.visibility !== 'hidden' && Number(style.opacity) > 0.05
  } catch {
    return false
  }
}

const onScreen = (box, view) => box.right > 0 && box.bottom > 0 && box.left < view.width && box.top < view.height

/**
 * The viewport boxes ({ left, top, right, bottom }, px) of the fixed controls on the page `doc`.
 * Never the vg-guide host itself (it has no box: its controls are in its shadow root). A missing
 * element is skipped; it never throws.
 */
export const fixedObstacles = (doc = globalThis.document) => {
  const out = []
  try {
    const win = doc.defaultView ?? globalThis
    const view = { width: doc.documentElement?.clientWidth || win.innerWidth || 0, height: win.innerHeight || doc.documentElement?.clientHeight || 0 }
    const add = (node, { needShown = false } = {}) => {
      try {
        const box = boxOf(node)
        if (box && onScreen(box, view) && (!needShown || shown(node))) out.push(box)
      } catch {}
    }
    add(doc.getElementById?.('vodafone-aw-icon'))
    const banner = doc.getElementById?.('onetrust-banner-sdk')
    if (banner) add(banner, { needShown: true })
    for (const peek of doc.querySelectorAll?.('.pocket-peek') ?? []) if (peek.dataset?.state !== 'hidden') add(peek, { needShown: true })
    for (const host of doc.querySelectorAll?.('vg-guide') ?? []) {
      const root = host.shadowRoot
      if (!root) continue
      for (const selector of GUIDE_ALWAYS) for (const node of root.querySelectorAll(selector)) add(node)
      for (const selector of GUIDE_WHILE_SHOWN) for (const node of root.querySelectorAll(selector)) add(node, { needShown: true })
      for (const selector of TRAIL) for (const node of root.querySelectorAll(selector)) add(node, { needShown: true })
    }
    // The trail mounts in the guide's shadow root; on a page where it is in the document, read it there too.
    for (const selector of TRAIL) for (const node of doc.querySelectorAll?.(selector) ?? []) add(node, { needShown: true })
  } catch {}
  return out
}

const near = (box, o, padding) => o.left < box.right + padding && o.right > box.left - padding && o.top < box.bottom + padding && o.bottom > box.top - padding

/**
 * How far (px) `box` must move across so that at least `padding` px lies between it and every
 * obstacle, moving no further than needed. `toward` is the way it may move: -1 (default) toward the
 * content on its left (it stands at the right margin), +1 toward the content on its right (it stands
 * at the left margin, the album right-to-left). An obstacle it would sit within reach of pushes its
 * leading edge to `padding` px short of it; that is repeated for whatever it then reaches. `clear` is
 * false when it still is not clear (no room before `min`, the leftmost its left edge may go, or `max`,
 * the rightmost its right edge may go): the caller treats the spot as covered.
 */
export const insetForObstacles = (box, obstacles, padding = 16, { min = -Infinity, max = Infinity, toward = -1 } = {}) => {
  const list = (obstacles ?? []).filter((o) => o && [o.left, o.top, o.right, o.bottom].every(Number.isFinite) && o.right > o.left && o.bottom > o.top)
  const right = toward > 0
  const width = box.right - box.left
  let dx = 0
  for (let i = 0; i <= list.length; i += 1) {
    const at = { left: box.left + dx, right: box.right + dx, top: box.top, bottom: box.bottom }
    const hits = list.filter((o) => near(at, o, padding))
    if (!hits.length) return { dx, clear: true }
    if (right) {
      const to = Math.max(...hits.map((o) => o.right + padding))
      const next = Math.max(dx, to - box.left)
      if (box.right + next > max) return { dx: Math.min(next, max - box.right), clear: false }
      if (next === dx) break
      dx = next
    } else {
      const to = Math.min(...hits.map((o) => o.left - padding)) - width
      const next = Math.min(dx, to - box.left)
      if (box.left + next < min) return { dx: Math.max(next, min - box.left), clear: false }
      if (next === dx) break
      dx = next
    }
  }
  return { dx, clear: false }
}

/**
 * A region of a w×h box's top-left corners (as the drone's follow regions are) cut short so the box
 * stops `margin` px above every obstacle it would reach; the region itself when none is in reach,
 * null when nothing is left of it.
 */
export const stopAbove = (region, obstacles, { w = 0, h = 0 } = {}, margin = 8) => {
  let height = region.height
  for (const o of obstacles ?? []) {
    if (!o) continue
    const across = o.left < region.left + region.width + w + margin && o.right > region.left - margin
    const reaches = o.bottom > region.top - margin && o.top < region.top + height + h + margin
    if (across && reaches) height = Math.min(height, o.top - margin - h - region.top)
  }
  if (height < 0) return null
  if (height === region.height) return region
  return { left: region.left, top: region.top, right: region.left + region.width, bottom: region.top + height, width: region.width, height }
}
