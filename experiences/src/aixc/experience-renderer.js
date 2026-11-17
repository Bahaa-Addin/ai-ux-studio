/**
 * Experience registry. Each experience is a plugin:
 *
 *   render(schema, index, options) → { element, mount?(), unmount?(), afterMount?: [], reveal?(itemId) }
 *
 * `mount` runs when the experience becomes visible (start timers, scroll
 * listeners); `unmount` runs when it is hidden or replaced. The registry wraps
 * both so they are idempotent (experience-wrap.js, which the live registry on
 * Vodafone's pages uses too: voice-guide ADR-0076). Adding an experience: write
 * the renderer, add it here, and allow its name in schema-validator.js (EXPERIENCES).
 */

import { renderMagazine } from './experiences/magazine.js'
import { renderSpotlight } from './experiences/spotlight.js'
import { renderJourney } from './experiences/journey.js'
import { renderGallery } from './experiences/gallery.js'
import { renderFlipbook } from './experiences/flipbook.js'
import { renderCube } from './experiences/cube.js'
import { renderStreaming, warmStreaming } from './experiences/streaming.js'
import { renderSplit } from './experiences/split.js'
import { renderFan } from './experiences/fan.js'
import { renderRing } from './experiences/ring.js'
import { renderTunnel } from './experiences/tunnel.js'
import { renderCanvas } from './experiences/canvas.js'
import { renderCoverflow } from './experiences/coverflow.js'
import { wrapExperience } from './experience-wrap.js'

const experiences = {
  magazine: { label: 'Magazine experience', render: renderMagazine },
  spotlight: { label: 'Spotlight cards', render: renderSpotlight },
  journey: { label: 'Scroll journey', render: renderJourney },
  gallery: { label: 'Gallery wall', render: renderGallery },
  flipbook: { label: 'Flipbook', render: renderFlipbook },
  cube: { label: 'Service cube', render: renderCube },
  streaming: { label: 'Streaming showcase', render: renderStreaming },
  split: { label: 'Split slideshow', render: renderSplit },
  fan: { label: 'Card fan', render: renderFan },
  ring: { label: 'Service ring', render: renderRing },
  tunnel: { label: 'Hyper tunnel', render: renderTunnel },
  canvas: { label: 'Infinite canvas', render: renderCanvas },
  coverflow: { label: 'Cover flow', render: renderCoverflow },
}

export const experienceLabel = (name) => experiences[name]?.label ?? 'Reimagined view'

/** Early, cheap preparation once the user shows intent (the composer opens): fetches what an opening needs. */
export const warmExperiences = () => {
  warmStreaming()
}

/**
 * @returns {{ element: HTMLElement, mounted: boolean, mount: Function, unmount: Function, reveal: Function }}
 */
export const renderExperience = (schema, index, options = {}) => {
  const experience = experiences[schema.experience]
  if (!experience) throw new Error(`AIXC: no renderer for experience "${schema.experience}"`)
  return wrapExperience(experience.render(schema, index, options))
}
