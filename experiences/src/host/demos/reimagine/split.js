/**
 * The split slideshow on Vodafone's own pages (live plan phase 4b; voice-guide ADR-0076): a chunk of its own, loaded
 * when its template is chosen (./registry.js). Vodafone's faces, the experiences' shared sheet and its own, as text,
 * once each on the page (ensureCss); its renderer through the mount wrapper the clone uses too. Its stage pins in the
 * box and keeps its controls and rail out of the bottom corners (split.css, the box's safe zones).
 */
import faces from '../../vodafone-faces.css'
import shared from '../../../aixc/experiences/vodafone.css'
import css from '../../../aixc/experiences/split.css'
import { renderSplit } from '../../../aixc/experiences/split.js'
import { wrapExperience } from '../../../aixc/experience-wrap.js'

export const load = ({ ensureCss }) => {
  ensureCss('vodafone-faces', faces)
  ensureCss('vx-shared', shared)
  ensureCss('vx-split', css)
  return (schema, index, options) => wrapExperience(renderSplit(schema, index, options))
}
