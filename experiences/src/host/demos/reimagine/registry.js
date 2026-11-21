/**
 * Reimagine's experiences on Vodafone's own pages (live plan phase 4a; voice-guide ADR-0076, phase 4 design §3.5):
 * each a chunk of its own, which the shell (./shell.js) asks for when its template is chosen, never before. A
 * module here exports load({ ensureCss }), which puts its stylesheets on the page and returns
 * (schema, index, options) => the experience through experience-wrap.js. All thirteen: magazine (it does not pin)
 * and spotlight (it pins a stage) from phase 4a; fan, coverflow, split and ring from phase 4b's Phases 1 and 2;
 * gallery, journey, cube and tunnel from its Phase 3; flipbook, canvas and streaming from its Phase 4 (canvas's and
 * streaming's previews in the box, never in the top layer: view-dialog.js). Each keeps its controls out of the safe
 * zones. The composer shows a button for each one here (./shell.js), in as many columns as fit.
 */
export const EXPERIENCES = {
  magazine: () => import('./magazine.js'),
  spotlight: () => import('./spotlight.js'),
  fan: () => import('./fan.js'),
  coverflow: () => import('./coverflow.js'),
  split: () => import('./split.js'),
  ring: () => import('./ring.js'),
  gallery: () => import('./gallery.js'),
  journey: () => import('./journey.js'),
  cube: () => import('./cube.js'),
  tunnel: () => import('./tunnel.js'),
  flipbook: () => import('./flipbook.js'),
  canvas: () => import('./canvas.js'),
  streaming: () => import('./streaming.js'),
}
