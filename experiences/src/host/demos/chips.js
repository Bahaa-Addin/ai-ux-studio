/**
 * "Pocket it" on Vodafone's own cards (live plan phase 3 S6; voice-guide ADR-0052 §10-§14): a chunk of its
 * own, which the Pocket chunk (./pocket.js) asks for first thing as it starts where chips can show (on the
 * website, where the page was read well enough: the overlay's own gate), or when a later reading of the page
 * lets them show. A page where they cannot show never loads it.
 *
 * It is the overlay (../../pocket/chips-overlay.js, with its placement, ../../pocket/chips-place.js) with its
 * stylesheet (../../pocket/chips-overlay.css) put on the page as text, once, in a marked <style> (the layer's
 * ensureCss), before its first slot is drawn. The chip, the liner and the lift stay the Pocket's (pocket.js
 * decorate, pocket.css): the overlay only places them over Vodafone's cards.
 */
import css from '../../pocket/chips-overlay.css'
import { createChips as createOverlay } from '../../pocket/chips-overlay.js'

/** `options` as initPocket gives them (its useChips), and the layer's ensureCss. */
export const createChips = (options, { ensureCss }) => {
  ensureCss('pocket-chips', css)
  return createOverlay(options)
}
