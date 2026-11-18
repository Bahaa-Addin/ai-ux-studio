/**
 * The card fan on Vodafone's own pages (live plan phase 4b; voice-guide ADR-0076): a chunk of its own, loaded when its
 * template is chosen (./registry.js). Vodafone's faces, the experiences' shared sheet and its own, as text, once each on
 * the page (ensureCss); its renderer through the mount wrapper the clone uses too. Its stage pins in the box, its
 * details and the app band keep out of the bottom corners, and the cards resting in a corner or past the box's sides
 * are inert (fan.css, fan.js keepClear(), the box's safe zones).
 */
import faces from '../../vodafone-faces.css'
import shared from '../../../aixc/experiences/vodafone.css'
import css from '../../../aixc/experiences/fan.css'
import { renderFan } from '../../../aixc/experiences/fan.js'
import { wrapExperience } from '../../../aixc/experience-wrap.js'

export const load = ({ ensureCss }) => {
  ensureCss('vodafone-faces', faces)
  ensureCss('vx-shared', shared)
  ensureCss('vx-fan', css)
  return (schema, index, options) => wrapExperience(renderFan(schema, index, options))
}
