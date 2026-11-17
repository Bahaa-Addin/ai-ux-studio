/**
 * The Pocket's mascot and drone on Vodafone's own pages (live plan phase 3 S12; voice-guide ADR-0052):
 * a chunk of its own, which the Pocket chunk (./pocket.js) loads at idle once there is something to
 * pocket or something pocketed, or at once when a "Pocket it" chip or the Pocket button is pressed or
 * focused. A page with an empty Pocket and no chips never loads it.
 *
 * It is the clone's actors (../../pocket/pocket-actors.js) with their stylesheets put on the page as
 * text, once, in a marked <style> (the layer's ensureCss), and a floor of their own that holds without
 * sticky positioning (Vodafone's html and body are overflow hidden auto). Their two SVG rigs are inside
 * this chunk as data: URLs (the aixc build's svg-inline plugin): nothing is fetched for them.
 */
import actorsCss from '../../pocket/pocket-actors.css'
import cursorCss from '../../pocket/pocket-cursor.css'
import { createPocketActors } from '../../pocket/pocket-actors.js'
import { fixedObstacles, watchFixedObstacles } from '../../pocket/obstacles.js'

/** `options` as initPocket gives them, and the layer's ensureCss. */
export const createActors = (options, { ensureCss }) => {
  ensureCss('pocket-actors', `${actorsCss}\n${cursorCss}`)
  // The mascot stands back from Vodafone's accessibility button and the Voice Guide's controls (AGENTS.md 4.6, ADR-0064),
  // and both make room again when one of them comes, goes or changes size while the album shows (F6b).
  return createPocketActors({ ...options, floor: 'fixed', obstacles: () => fixedObstacles(), watch: watchFixedObstacles })
}
