/**
 * The hyper tunnel on Vodafone's own pages (live plan phase 4b; voice-guide ADR-0076): a chunk of its own, loaded when
 * its template is chosen (./registry.js). Vodafone's faces, the experiences' shared sheet and its own, as text, once
 * each on the page (ensureCss); its renderer through the mount wrapper the clone uses too. Its stage pins in the box
 * with its HUD's prev / next out of the bottom corners (at the bottom centre between them, under the HUD's title on
 * phones); what flies past the stage's sides or into a corner's zone is inert while there, and a box too short for the
 * stage (a phone in landscape) lays it flat, as reduced motion does (tunnel.css, tunnel.js fence() and SHORT_ROOM).
 */
import faces from '../../vodafone-faces.css'
import shared from '../../../aixc/experiences/vodafone.css'
import css from '../../../aixc/experiences/tunnel.css'
import { renderTunnel } from '../../../aixc/experiences/tunnel.js'
import { wrapExperience } from '../../../aixc/experience-wrap.js'

export const load = ({ ensureCss }) => {
  ensureCss('vodafone-faces', faces)
  ensureCss('vx-shared', shared)
  ensureCss('vx-tunnel', css)
  return (schema, index, options) => wrapExperience(renderTunnel(schema, index, options))
}
