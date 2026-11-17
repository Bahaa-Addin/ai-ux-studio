/**
 * Reimagine's experiences on Vodafone's own pages (live plan phase 4a; voice-guide ADR-0076, phase 4 design §3.5):
 * each a chunk of its own, which the shell (./shell.js) asks for when its template is chosen, never before. A
 * module here exports load({ ensureCss }), which puts its stylesheets on the page and returns
 * (schema, index, options) => the experience through experience-wrap.js. Phase 4a has two: magazine (it does not
 * pin) and spotlight (it pins a stage); 4b adds the other eleven here, each with its controls in the safe zones.
 */
export const EXPERIENCES = {
  magazine: () => import('./magazine.js'),
  spotlight: () => import('./spotlight.js'),
}
