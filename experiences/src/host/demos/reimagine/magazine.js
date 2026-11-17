/**
 * The magazine on Vodafone's own pages (live plan phase 4a; voice-guide ADR-0076): a chunk of its own, loaded when
 * its template is chosen (./registry.js). Vodafone's faces, the experiences' shared sheet and its own, as text,
 * once each on the page (ensureCss); its renderer through the mount wrapper the clone uses too.
 */
import faces from '../../vodafone-faces.css'
import shared from '../../../aixc/experiences/vodafone.css'
import css from '../../../aixc/experiences/magazine.css'
import { renderMagazine } from '../../../aixc/experiences/magazine.js'
import { wrapExperience } from '../../../aixc/experience-wrap.js'

export const load = ({ ensureCss }) => {
  ensureCss('vodafone-faces', faces)
  ensureCss('vx-shared', shared)
  ensureCss('vx-magazine', css)
  return (schema, index, options) => wrapExperience(renderMagazine(schema, index, options))
}
