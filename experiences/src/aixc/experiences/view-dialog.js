/**
 * The preview dialog canvas and streaming open over their view (voice-guide ADR-0076 §7; AGENTS.md §4.6). A module of
 * its own beside the seam (./shared.js), so only the experiences that open one carry it: shared.js is one chunk with
 * the shell on Vodafone's pages, and everything in it any experience uses counts in the shell's budget.
 */
import { keep, on, onViewResize, viewScroller, viewBottom, viewTop } from './shared.js'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
const SCROLL_KEYS = { ArrowUp: -1, PageUp: -1, Home: -1, ArrowDown: 1, PageDown: 1, End: 1, ' ': 1 }

/** Whether something from `node` up to `top` would scroll by a gesture or key going `dir` (-1 up, 1 down). */
const scrollsInside = (node, top, dir) => {
  for (let at = node; at && at.nodeType === 1; at = at === top ? null : at.parentElement) {
    if (at.scrollHeight > at.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(at).overflowY)) {
      if (dir > 0 ? at.scrollTop + at.clientHeight < at.scrollHeight - 1 : at.scrollTop > 0) return true
    }
  }
  return false
}

/**
 * A preview dialog over the view (canvas's and streaming's; voice-guide ADR-0076 §7). The clone (no scroller): the
 * browser's modal dialog, as before (showModal(); its own Escape fires `cancel`, which the experience handles). With a
 * scroller (Vodafone's pages) never the top layer, so nothing of ours covers Vodafone's accessibility widget or the
 * guide (AGENTS.md §4.6): dialog.show(), over the box's room under its view bar (--vx-sheet-top and --vx-sheet-h on the
 * dialog, in its containing block's coordinates, which the experience's box rules place), the box's other content
 * inert, the box's scroll held (and no wheel, touch or key scroll leaving the dialog for the page), Tab and Shift+Tab
 * kept inside it, Escape calls `onEscape` (the experience closes it). Not aria-modal: the page around the box stays as
 * it is. All of that is one off the seam keeps, so configure() undoes it too.
 *   open(opener)       shows it; close() gives the focus back to `opener`
 *   close({ focus })   hides it and undoes the above; focus false leaves the focus where it is
 *   shown              whether it shows
 */
export const viewDialog = (dialog, { onEscape } = {}) => {
  let opener = null
  let undo = null
  const close = ({ focus = true } = {}) => {
    if (undo) undo()
    else if (dialog.open) dialog.close()
    const back = opener
    opener = null
    if (focus && back?.isConnected && !back.closest('[inert]')) back.focus({ preventScroll: true })
  }
  const open = (from) => {
    if (dialog.open) return
    opener = from ?? null
    const box = viewScroller()
    if (!box) return dialog.showModal()
    const tabWas = dialog.getAttribute('tabindex')
    dialog.tabIndex = -1
    const inerted = []
    for (let node = dialog; box.contains(node) && node !== box; node = node.parentElement) {
      for (const sibling of node.parentElement.children) {
        if (sibling !== node && !sibling.inert) {
          sibling.inert = true
          inerted.push(sibling)
        }
      }
    }
    const { style } = box
    const was = [style.overflowY, style.scrollbarGutter]
    if (box.offsetWidth - box.clientWidth > box.clientLeft * 2 + 0.5) style.scrollbarGutter = 'stable'
    style.overflowY = 'hidden'
    // Placed before it shows: show() focuses its first control, which must not scroll the box or the window to reach it.
    let within = dialog.parentElement
    while (within && within !== box && getComputedStyle(within).position === 'static') within = within.parentElement
    within ??= box
    const place = () => {
      const top = viewTop() - within.getBoundingClientRect().top - within.clientTop
      dialog.style.setProperty('--vx-sheet-top', `${Math.round(top)}px`)
      dialog.style.setProperty('--vx-sheet-h', `${Math.round(viewBottom() - viewTop())}px`)
    }
    place()
    dialog.show()
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onEscape?.()
      } else if (event.key === 'Tab') {
        const list = [...dialog.querySelectorAll(FOCUSABLE)].filter((node) => node.getClientRects().length && !node.closest('[inert]') && getComputedStyle(node).visibility !== 'hidden')
        const at = document.activeElement
        const [first, last] = [list[0], list[list.length - 1]]
        const to = !first ? dialog : event.shiftKey ? (at === first || at === dialog || !dialog.contains(at) ? last : null) : at === last || !dialog.contains(at) ? first : null
        if (to) {
          event.preventDefault()
          to.focus({ preventScroll: true })
        }
      } else if (event.key in SCROLL_KEYS && !event.target.closest('input, textarea, select, [contenteditable]') && !(event.key === ' ' && event.target.closest('a, button'))) {
        if (!scrollsInside(event.target, dialog, SCROLL_KEYS[event.key])) event.preventDefault()
      }
    }
    let touchY = 0
    const offs = [
      on(dialog, 'keydown', onKey),
      on(dialog, 'wheel', (event) => scrollsInside(event.target, dialog, Math.sign(event.deltaY)) || event.preventDefault(), { passive: false }),
      on(dialog, 'touchstart', (event) => (touchY = event.touches[0]?.clientY ?? 0), { passive: true }),
      on(dialog, 'touchmove', (event) => {
        const y = event.touches[0]?.clientY ?? touchY
        if (!scrollsInside(event.target, dialog, Math.sign(touchY - y))) event.preventDefault()
        touchY = y
      }, { passive: false }),
      onViewResize(place),
    ]
    undo = keep(() => {
      undo = null
      for (const off of offs) off()
      for (const node of inerted) node.inert = false
      ;[style.overflowY, style.scrollbarGutter] = was
      if (tabWas === null) dialog.removeAttribute('tabindex')
      else dialog.setAttribute('tabindex', tabWas)
      dialog.close()
    })
  }
  return {
    open,
    close,
    get shown() {
      return dialog.open
    },
  }
}
