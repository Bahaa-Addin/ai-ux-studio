/**
 * Where a "Pocket it" chip sits on one of Vodafone's live cards (phase 3 S6; ADR-0052 §12). Pure
 * geometry on viewport boxes ({ left, top, right, bottom }), no DOM, so it is tested on its own.
 *
 * The corners are tried in this order: top end, bottom end, top start, bottom start, where the end is
 * the right in a left-to-right page and the left in Arabic. A corner is taken when the chip lies inside
 * the visible part of the card (the card cut by every ancestor that clips it, such as Owl's stage) and
 * meets none of the `avoid` boxes (the card's headings and its own smaller buttons) and none of the `fixed`
 * ones (on the first screen, the trail's pill and the guide's microphone where they rest at scroll 0, see
 * overFirstScreen). The full chip is tried first, then an icon-only one (its name stays for screen
 * readers). When nothing fits, the icon-only chip goes to the top end corner and is counted as unplaced
 * (owner, 2026-11-13); to the next corner in the same order when a `fixed` box lies over that one (F9,
 * F8b), since a press there never reaches it.
 */

/** The part of `rect` inside every box in `clips`, or null when nothing of it is left. */
export const clipBox = (rect, clips = []) => {
  let r = { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }
  for (const c of clips) r = { left: Math.max(r.left, c.left), top: Math.max(r.top, c.top), right: Math.min(r.right, c.right), bottom: Math.min(r.bottom, c.bottom) }
  return r.right - r.left > 0 && r.bottom - r.top > 0 ? r : null
}

/**
 * A control fixed on the screen (the trail's pill at its top, F9; the guide's microphone at its bottom, F8b)
 * as the chips of the first screen keep clear of it. `rest` is its viewport box where it rests at scroll 0,
 * the first screen a visitor sees; the result is where that lies over the page now that it is scrolled by
 * `scroll` ({ x, y }), in viewport coordinates, or null for a `card` (its viewport box) that does not start
 * in that first screen (`height` px). Chips are not picked again on scroll (ADR-0052 §12), so the first
 * screen is the one where they meet it.
 */
export const overFirstScreen = (rest, { card, scroll = { x: 0, y: 0 }, height }) => {
  if (!rest || !card || !(card.top + scroll.y < height)) return null
  return { left: rest.left - scroll.x, top: rest.top - scroll.y, right: rest.right - scroll.x, bottom: rest.bottom - scroll.y }
}

const meets = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
const CORNERS = ['top-end', 'bottom-end', 'top-start', 'bottom-start']

/**
 * The chip's viewport position, its corner, whether it is icon-only and whether nothing fitted; or null
 * when the card shows nothing (no size, or clipped away).
 */
export const placeChip = ({ card, avoid = [], fixed = [], clips = [], size, iconSize, dir = 'ltr', small = false }) => {
  const seen = clipBox(card, clips)
  if (!seen) return null
  const inset = small ? 8 : 10
  const at = (corner, { width, height }) => {
    const end = corner.endsWith('end') === (dir !== 'rtl')
    const x = end ? seen.right - inset - width : seen.left + inset
    const y = corner.startsWith('top') ? seen.top + inset : seen.bottom - inset - height
    return { x, y, box: { left: x, top: y, right: x + width, bottom: y + height } }
  }
  const under = (b) => fixed.some((a) => meets(b, a))
  const fits = (b) => b.left >= seen.left && b.right <= seen.right && b.top >= seen.top && b.bottom <= seen.bottom && !avoid.some((a) => meets(b, a)) && !under(b)
  for (const [chip, icon] of [
    [size, false],
    [iconSize, true],
  ])
    for (const corner of CORNERS) {
      const p = at(corner, chip)
      if (fits(p.box)) return { x: p.x, y: p.y, corner, icon, unplaced: false }
    }
  const corner = CORNERS.find((c) => !under(at(c, iconSize).box)) ?? 'top-end'
  const p = at(corner, iconSize)
  return { x: p.x, y: p.y, corner, icon: true, unplaced: true }
}
