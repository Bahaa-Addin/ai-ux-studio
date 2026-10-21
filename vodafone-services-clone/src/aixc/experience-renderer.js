/**
 * Experience registry. Each experience is a plugin:
 *
 *   render(schema, index, options) → { element, mount?(), unmount?(), afterMount?: [] }
 *
 * `mount` runs when the experience becomes visible (start timers, scroll
 * listeners); `unmount` runs when it is hidden or replaced. The registry wraps
 * both so they are idempotent. Adding an experience: write the renderer, add it
 * here, and allow its name in schema-validator.js (EXPERIENCES).
 */

import { renderMagazine } from './experiences/magazine.js'
import { renderSpotlight } from './experiences/spotlight.js'
import { renderJourney } from './experiences/journey.js'
import { renderGallery } from './experiences/gallery.js'
import { renderFlipbook } from './experiences/flipbook.js'
import { renderCube } from './experiences/cube.js'
import { renderStreaming } from './experiences/streaming.js'

const experiences = {
  magazine: { label: 'Magazine experience', render: renderMagazine },
  spotlight: { label: 'Spotlight cards', render: renderSpotlight },
  journey: { label: 'Scroll journey', render: renderJourney },
  gallery: { label: 'Gallery wall', render: renderGallery },
  flipbook: { label: 'Flipbook', render: renderFlipbook },
  cube: { label: 'Service cube', render: renderCube },
  streaming: { label: 'Streaming showcase', render: renderStreaming },
}

export const experienceLabel = (name) => experiences[name]?.label ?? 'Reimagined view'

/**
 * @returns {{ element: HTMLElement, mount: Function, unmount: Function }}
 */
export const renderExperience = (schema, index, options = {}) => {
  const experience = experiences[schema.experience]
  if (!experience) throw new Error(`AIXC: no renderer for experience "${schema.experience}"`)
  const output = experience.render(schema, index, options)
  let mounted = false
  let afterMountDone = false
  return {
    element: output.element,
    mount() {
      if (mounted) return
      mounted = true
      if (!afterMountDone) {
        afterMountDone = true
        output.afterMount?.forEach((callback) => callback())
      }
      output.mount?.()
    },
    unmount() {
      if (!mounted) return
      mounted = false
      output.unmount?.()
    },
  }
}
