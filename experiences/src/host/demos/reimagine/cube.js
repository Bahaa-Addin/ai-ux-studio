/**
 * The service cube on Vodafone's own pages (live plan phase 4b; voice-guide ADR-0076): a chunk of its own, loaded when
 * its template is chosen (./registry.js). Vodafone's faces, the experiences' shared sheet and its own, as text, once
 * each on the page (ensureCss); its renderer through the mount wrapper the clone uses too. Its stage pins in the box
 * beside the story (under the sheets on phones), its scene dots keep out of the bottom corners, and the links that
 * flow past a corner are inert while there (cube.css, cube.js placeDots() and fence(), the box's safe zones).
 */
import faces from '../../vodafone-faces.css'
import shared from '../../../aixc/experiences/vodafone.css'
import css from '../../../aixc/experiences/cube.css'
import { renderCube } from '../../../aixc/experiences/cube.js'
import { wrapExperience } from '../../../aixc/experience-wrap.js'

export const load = ({ ensureCss }) => {
  ensureCss('vodafone-faces', faces)
  ensureCss('vx-shared', shared)
  ensureCss('vx-cube', css)
  return (schema, index, options) => wrapExperience(renderCube(schema, index, options))
}
