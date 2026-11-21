/**
 * The infinite canvas on Vodafone's own pages (live plan phase 4b; voice-guide ADR-0076): a chunk of its own, loaded when
 * its template is chosen (./registry.js). Vodafone's faces, the experiences' shared sheet and its own, as text, once each
 * on the page (ensureCss); its renderer through the mount wrapper the clone uses too. Its stage is the box's room and
 * takes the drag; the cards resting past the box's sides or in a bottom corner's zone are inert while there (canvas.js
 * fence()); its preview opens in the box, never in the top layer (ADR-0076 §7; view-dialog.js viewDialog).
 */
import faces from '../../vodafone-faces.css'
import shared from '../../../aixc/experiences/vodafone.css'
import css from '../../../aixc/experiences/canvas.css'
import { renderCanvas } from '../../../aixc/experiences/canvas.js'
import { wrapExperience } from '../../../aixc/experience-wrap.js'

export const load = ({ ensureCss }) => {
  ensureCss('vodafone-faces', faces)
  ensureCss('vx-shared', shared)
  ensureCss('vx-canvas', css)
  return (schema, index, options) => wrapExperience(renderCanvas(schema, index, options))
}
