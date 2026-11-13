/**
 * Where a "Pocket it" chip sits on one of Vodafone's live cards (phase 3 S6; ADR-0052 §12). Pure
 * geometry on viewport boxes ({ left, top, right, bottom }), no DOM, so it is tested on its own.
 *
 * The corners are tried in this order: top end, bottom end, top start, bottom start, where the end is
 * the right in a left-to-right page and the left in Arabic. A corner is taken when the chip lies inside
 * the visible part of the card (the card cut by every ancestor that clips it, such as Owl's stage) and
 * meets none of the `avoid` boxes (the card's headings and its own smaller buttons). The full chip is
 * tried first, then an icon-only one (its name stays for screen readers). When nothing fits, the
 * icon-only chip goes to the top end corner and is counted as unplaced (owner, 2026-11-13).
 */

/** The part of `rect` inside every box in `clips`, or null when nothing of it is left. */
export const clipBox = (rect, clips = []) => {
  let r = { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }
  for (const c of clips) r = { left: Math.max(r.left, c.left), top: Math.max(r.top, c.top), right: Math.min(r.right, c.right), bottom: Math.min(r.bottom, c.bottom) }
  return r.right - r.left > 0 && r.bottom - r.top > 0 ? r : null
}

const meets = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
const CORNERS = ['top-end', 'bottom-end', 'top-start', 'bottom-start']

/**
 * The chip's viewport position, its corner, whether it is icon-only and whether nothing fitted; or null
 * when the card shows nothing (no size, or clipped away).
 */
export const placeChip = ({ card, avoid = [], clips = [], size, iconSize, dir = 'ltr', small = false }) => {
  const seen = clipBox(card, clips)
  if (!seen) return null
  const inset = small ? 8 : 10
  const at = (corner, { width, height }) => {
    const end = corner.endsWith('end') === (dir !== 'rtl')
    const x = end ? seen.right - inset - width : seen.left + inset
    const y = corner.startsWith('top') ? seen.top + inset : seen.bottom - inset - height
    return { x, y, box: { left: x, top: y, right: x + width, bottom: y + height } }
  }
  const fits = (b) => b.left >= seen.left && b.right <= seen.right && b.top >= seen.top && b.bottom <= seen.bottom && !avoid.some((a) => meets(b, a))
  for (const [chip, icon] of [
    [size, false],
    [iconSize, true],
  ])
    for (const corner of CORNERS) {
      const p = at(corner, chip)
      if (fits(p.box)) return { x: p.x, y: p.y, corner, icon, unplaced: false }
    }
  const p = at('top-end', iconSize)
  return { x: p.x, y: p.y, corner: 'top-end', icon: true, unplaced: true }
}
