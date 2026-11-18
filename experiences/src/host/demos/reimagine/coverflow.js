/**
 * The cover flow on Vodafone's own pages (live plan phase 4b; voice-guide ADR-0076): a chunk of its own, loaded when
 * its template is chosen (./registry.js). Vodafone's faces, the experiences' shared sheet and its own, as text, once
 * each on the page (ensureCss); its renderer through the mount wrapper the clone uses too. Its stage pins in the box,
 * its panel (the controls and the front service's details) and the app band keep out of the bottom corners, and the
 * covers cut by the box's sides or resting in a corner are inert (coverflow.css, coverflow.js keepClear(), the box's
 * safe zones).
 */
import faces from '../../vodafone-faces.css'
import shared from '../../../aixc/experiences/vodafone.css'
import css from '../../../aixc/experiences/coverflow.css'
import { renderCoverflow } from '../../../aixc/experiences/coverflow.js'
import { wrapExperience } from '../../../aixc/experience-wrap.js'

export const load = ({ ensureCss }) => {
  ensureCss('vodafone-faces', faces)
  ensureCss('vx-shared', shared)
  ensureCss('vx-coverflow', css)
  return (schema, index, options) => wrapExperience(renderCoverflow(schema, index, options))
}
