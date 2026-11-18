/**
 * The service ring on Vodafone's own pages (live plan phase 4b; voice-guide ADR-0076): a chunk of its own, loaded
 * when its template is chosen (./registry.js). Vodafone's faces, the experiences' shared sheet and its own, as text,
 * once each on the page (ensureCss); its renderer through the mount wrapper the clone uses too. Its stage pins in the
 * box, its foot in one column at the bottom centre with the counter and prev / next out of the bottom corners
 * (ring.css, the box's safe zones), and the services it turns past the stage's sides not pressable while there.
 */
import faces from '../../vodafone-faces.css'
import shared from '../../../aixc/experiences/vodafone.css'
import css from '../../../aixc/experiences/ring.css'
import { renderRing } from '../../../aixc/experiences/ring.js'
import { wrapExperience } from '../../../aixc/experience-wrap.js'

export const load = ({ ensureCss }) => {
  ensureCss('vodafone-faces', faces)
  ensureCss('vx-shared', shared)
  ensureCss('vx-ring', css)
  return (schema, index, options) => wrapExperience(renderRing(schema, index, options))
}
