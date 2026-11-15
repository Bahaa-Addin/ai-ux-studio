/**
 * Portal configuration: every knob a pilot may want to turn, in one place
 * (docs/adr/0005-pocket-portal-transition.md, "Pilot knobs").
 *
 * Resolution order: these defaults ← `initPocket({ portal })` options ← URL parameters
 * (`?portal=off`, `?portal-speed=0.5`, `?portal-embed=never|same-origin|allowlist`,
 * `?portal-world=glow|mist|hall`, `?portal-camera=walk|still`, `?portal-debug`), so a demo can be slowed
 * down, compared or switched off without a rebuild.
 */

export const PORTAL_DEFAULTS = {
  enabled: true,

  /**
   * On Vodafone's live pages (live plan phase 3, step S13). Off (the clone's behaviour) by default.
   * With it: the click listener sits on the album root (`viewEvents`) and takes only the stickers'
   * own links (`links`); eligible hosts are this page's origin only; the destination never runs
   * scripts; `fetchOnce` is on; the accessibility button and the guide are never written to; Escape
   * cancels instead of skipping ahead. (resolvePortalConfig forces these; options cannot undo them.)
   */
  live: false,
  /** With `live`: the links inside the album root that get the portal (the sticker's own link). */
  links: '.pocket-sticker a[href]',
  /**
   * The destination is fetched once (fetch, same-origin credentials) and drawn in a script-free
   * frame from that response (srcdoc, with a <base href>); the real navigation afterwards is meant
   * to come from the HTTP cache. Any failure shows the preview, with no second request.
   * null: on when `live`, off otherwise (the clone loads the frame from its URL, as before).
   */
  fetchOnce: null,
  /** Puts portal.css on the page (the host's own style helper); null: a <link> next to the module. */
  stylesheet: null,
  /** Called on every node the portal adds to the page (returns the node); null: as is. */
  mark: null,
  /** Wraps every listener, timer and frame callback the portal registers (returns the function); null: as is. */
  wrap: null,
  /** Told about any error the portal recovered from (it navigates natively and stays off for the page). */
  report: null,
  /** { opening: (title) => string }, the 'Opening {title}' status; null: the clone's own strings (../../i18n.js, loaded lazily). */
  labels: null,
  /** Test-only: called with a step's name ('portal-start') where a test may make the portal fail (the host's checkpoint). */
  checkpoint: null,

  /** Only links whose destination is on these hosts (or this page's own origin) get the portal. */
  hosts: [/(^|\.)vodafone\.com\.eg$/i],
  /** Links that always navigate natively (in addition to new-tab, download and modified clicks). */
  exclude: '[data-portal="off"], [data-portal-skip], .aixc-composer a, .aixc-launcher a',

  /** Overall speed: 1 = designed timing, 0.5 = twice as long (demos), 2 = twice as fast. */
  speed: 1,
  /**
   * The cue sheet, in ms from the click. The phases overlap: nothing waits for the one before to
   * finish. The viewer moves in from the first frame, gathering speed like a launch: they push the
   * wall over as they close in on it (so its fall comes from them, not from a timer) and go through
   * where it stood; the destination comes toward them too and meets them with a long, soft ease-out.
   */
  timing: {
    unlatch: 200, // light starts to leak round the wall's edges as it is let go
    fall: 720, // still viewer only: the wall, let go, first touches the floor (walking, the push and gravity decide)
    rise: 520, // the light behind it rises to its brightest (a slow swell, then it settles and breathes)
    ignite: 250, // the portal starts to glow in the light, still hidden behind the wall
    gateIn: 850, // how long it takes to appear: the page in the light first, then its red outline is traced round it
    arrive: 3500, // the planned move ends; its last stretch is a soft ease-out under a pixel a frame, so it is seen to settle a little earlier (it counts as arrived with under 0.6 px to go), then the handoff two frames later
    hold: 0.25, // where the approach checks the page is ready (fraction of its time; never before the wall is let go); if not, it brakes and hovers
    readyTimeout: 3800, // from the click: give up waiting and use the preview
    watchdog: 9000, // from the click: navigate whatever happens
  },

  wall: {
    push: 0.03, // still viewer: how far it eases back as it is let go (fraction of the perspective)
    shove: 2, // still viewer: how firmly it is let go (0: a pure fall from upright, which hangs before it drops)
    shoveFor: 0.3, // still viewer: how long the shove lasts (in the fall's own time units)
    gravity: 260, // walking viewer: once pushed past the point of balance, how fast it falls (ms; larger falls slower)
    thickness: 14, // px
    wash: 640, // ms for the light to absorb the fallen wall (from just before it lands)
    cushion: 6, // air under the falling wall: higher settles softer (6: meets the floor at about a fifth of its top speed)
    cushionFrom: 1.0, // where the cushion starts to act (radians from upright; the floor is at 1.571)
    bounce: 0.12, // its rebound off the floor (0 = none)
  },

  tunnel: {
    // 'glow': a glowing, dreamlike white space, nothing in it but light; 'mist': the same with glowing
    // fog the portal emerges from; 'hall': a gleaming passage of light
    style: 'glow',
    depth: 14, // tunnel length in perspectives
    fog: 2.1, // haze distance in perspectives
    margin: [0.14, 0.16], // how far the side walls and ceiling stand beyond the viewport (fractions)
    ribs: 0.95, // spacing of the architectural frames, in perspectives
  },

  /** The glowing white space ('glow' style): no mist, no fog; only a light behind the portal. */
  glow: {
    light: 0.95, // how brightly the light behind the portal glows (0..1)
    rays: 0, // soft shafts of light from it (0..1; 0: a pure glow)
    grain: 0.004, // a dither too fine to see, so the white's soft gradient never bands
    soften: 14, // soft focus of the portal when far, px in its own space (0 for none)
  },

  /** The misty void ('mist' style): glowing fog, lit by a light behind the portal. */
  mist: {
    glow: 0.95, // how brightly the light behind the portal lights the fog (0..1)
    rays: 0.9, // the soft shafts of light streaming out through the fog (0..1)
    lit: 1, // how brightly the mist glows where the light reaches it (0..1)
    cover: [0.3, 0.66], // where mist begins and where it is thickest (levels of its noise, 0..1: lower = more mist)
    fog: 5.5, // how far (in perspectives) the fog takes to swallow two thirds of something
    depth: 0.62, // how much of the far portal the fog takes (0 none, 1 all of it)
    density: 0.9, // how thick the drifting mist is
    drift: 9000, // ms for a bank of mist to drift past on its own
    flow: 1.4, // banks of mist that flow past while the portal travels
    grain: 0.014, // the fine grain of the fog (0..1)
    soften: 40, // soft focus of the portal when far, px in its own space (it shrinks with distance)
  },

  /**
   * The viewer. 'walk': from the click the viewer moves in on the page, pushes it over, and goes on
   * through the opening where it stood, over the fallen page, toward the destination, which comes
   * toward them too. 'still': the viewer stays where they are and the destination comes to them.
   */
  camera: {
    mode: 'walk',
    travel: 2.2, // how far the viewer moves, in perspectives (the same on every screen); the destination comes the rest of the way
    // The viewer's speed over the move, x^p (1 − x)^q in distance: from rest at the click, building
    // smoothly and steadily (a slow ease-in), so the page grows on screen from the start while it
    // tips (about 3% by 0.15 s, 12% by 0.3 s, 30% by 0.45 s), fastest about a second in, after the
    // wall, then slowing while the destination comes.
    ease: [1.15, 3],
    // The push, in shares of the viewer's way (so it is timed the same on every screen): the eye
    // meets the wall at the first, and by the second the push alone has tipped it 45° (gravity has
    // usually taken it further by then).
    push: [0.01, 0.09],
    contact: 0.01, // share of the way over which the push takes hold (soft: moving in blends into pushing, no jolt)
    passes: 3.5, // 'mist' only: banks of mist the viewer passes on the way (they stream by at the speed of the move)
    wash: 0.3, // how far the fallen page fades into the light before it is walked over (0..1; 'still' fades it fully)
    bob: 0, // the rise and fall of steps, as a fraction of the viewport height (0: a smooth, cinematic glide; 0.0045: walking)
    steps: 1.8, // steps per second
    sway: 0.7, // side to side, relative to the rise and fall
  },

  portal: {
    startScale: { wide: 0.17, narrow: 0.23 }, // how big the destination first looks
    // The destination's own speed toward the viewer, x^p (1 − x)^q in distance: it sets off after
    // the viewer (larger p: later); with the viewer's own move it seems to come closer fastest about
    // 1.4 s in and grows fastest on screen about 1.8 s in, then a long, very soft ease-out into the
    // page (larger q: softer), as long as the way in, so it never rushes at the eye.
    ease: [2.5, 7],
    hover: 0.025, // walking: how high it rises off the floor as it comes toward the viewer (fraction of the viewport height; it lands on the viewport)
    lift: 0.05, // still viewer: how high it floats when far, as a fraction of the viewport height
    frame: 0.007, // where the red line runs: this far outside the page (fraction of the viewport's shorter side)
    line: [8, 12], // the soft red line's width on screen, px (far, near; for a 900 px high screen, scaled with it)
    trace: 1300, // ms for two lights to draw the line round the page, from opposite corners (they set off from rest)
    flow: 3500, // ms for each light to go once round it afterwards (slower than while drawing)
    lights: 2, // how many lights travel round it (1 or 2)
  },

  light: {
    glow: 0.95, // the bloom of the hall's lights (0..1)
    rays: 0.6, // the shafts of light from the source (0..1)
    glare: 0.62, // how blinding the first light is (0..1)
    ambient: 0.06, // white haze left over the tunnel once the eye adapts
    red: 0.7, // strength of the red glow and its reflection
  },

  destination: {
    /** 'same-origin' (default), 'allowlist' (also `allow` origins), or 'never' (always the preview). */
    embed: 'same-origin',
    allow: [],
    /** Run the destination's scripts in the preview frame (off: no analytics, no storage side effects). */
    scripts: false,
  },

  /** 'navigate': with prefers-reduced-motion the link just works, no transition. */
  reducedMotion: 'navigate',

  debug: false,
}

const merge = (base, extra) => {
  if (!extra || typeof extra !== 'object') return base
  const out = Array.isArray(base) ? [...base] : { ...base }
  for (const [key, value] of Object.entries(extra)) {
    out[key] = value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof RegExp) && base[key] && typeof base[key] === 'object' ? merge(base[key], value) : value
  }
  return out
}

/** Defaults ← options ← URL parameters. */
export const resolvePortalConfig = (options = {}, search = typeof location === 'object' ? location.search : '') => {
  let config = merge(PORTAL_DEFAULTS, options)
  const params = new URLSearchParams(search)
  if (params.get('portal') === 'off') config = { ...config, enabled: false }
  const speed = Number(params.get('portal-speed'))
  if (speed > 0) config = { ...config, speed }
  const embed = params.get('portal-embed')
  if (['never', 'same-origin', 'allowlist'].includes(embed)) config = merge(config, { destination: { embed } })
  const world = params.get('portal-world')
  if (world === 'glow' || world === 'mist' || world === 'hall') config = merge(config, { tunnel: { style: world } })
  const viewer = params.get('portal-camera')
  if (viewer === 'walk' || viewer === 'still') config = merge(config, { camera: { mode: viewer } })
  if (params.has('portal-debug')) config = { ...config, debug: true }
  return forLive(config)
}

const identity = (value) => value

/**
 * What `live` forces, whatever the options or the URL say: this page's origin only, no scripts in
 * the destination, the fetch-once frame (switched off explicitly: the preview, never a frame loaded
 * from the destination's URL). `mark` and `wrap` are
 * always functions afterwards.
 */
const forLive = (config) => {
  const out = {
    ...config,
    live: Boolean(config.live),
    mark: typeof config.mark === 'function' ? config.mark : identity,
    wrap: typeof config.wrap === 'function' ? config.wrap : identity,
    report: typeof config.report === 'function' ? config.report : null,
    stylesheet: typeof config.stylesheet === 'function' ? config.stylesheet : null,
    labels: config.labels && typeof config.labels.opening === 'function' ? config.labels : null,
    checkpoint: typeof config.checkpoint === 'function' ? config.checkpoint : null,
    fetchOnce: config.fetchOnce === null || config.fetchOnce === undefined ? Boolean(config.live) : Boolean(config.fetchOnce),
  }
  if (!out.live) return out
  return {
    ...out,
    hosts: [],
    links: typeof out.links === 'string' && out.links ? out.links : PORTAL_DEFAULTS.links,
    // Never the frame loaded from its URL on live (a second request for the page): with the
    // fetch-once frame switched off, the preview.
    destination: { ...out.destination, scripts: false, ...(out.fetchOnce ? {} : { embed: 'never' }) },
  }
}

/** Timing scaled by `speed` (only durations; `hold` is a fraction). */
export const timingFor = (config) => {
  const out = {}
  for (const [key, value] of Object.entries(config.timing)) out[key] = key === 'hold' ? value : value / config.speed
  return out
}
