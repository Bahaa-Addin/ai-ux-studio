/**
 * The streaming showcase on Vodafone's own pages (live plan phase 4b; voice-guide ADR-0076): a chunk of its own, loaded
 * when its template is chosen (./registry.js). Vodafone's faces, the experiences' shared sheet and its own, as text,
 * once each on the page (ensureCss); its renderer through the mount wrapper the clone uses too. In the box its opening
 * covers the box's room and ends on the box's scroll, its wordmark is in Vodafone's bold face (no Roboto, nothing asked
 * of Google), what passes a bottom corner's zone takes no press while there (streaming.js fence()), and its preview
 * opens in the box, never in the top layer (ADR-0076 §7; view-dialog.js viewDialog).
 */
import faces from '../../vodafone-faces.css'
import shared from '../../../aixc/experiences/vodafone.css'
import css from '../../../aixc/experiences/streaming.css'
import { renderStreaming } from '../../../aixc/experiences/streaming.js'
import { wrapExperience } from '../../../aixc/experience-wrap.js'

export const load = ({ ensureCss }) => {
  ensureCss('vodafone-faces', faces)
  ensureCss('vx-shared', shared)
  ensureCss('vx-streaming', css)
  return (schema, index, options) => wrapExperience(renderStreaming(schema, index, options))
}
