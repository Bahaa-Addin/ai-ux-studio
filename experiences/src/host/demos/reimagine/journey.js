/**
 * The scroll journey on Vodafone's own pages (live plan phase 4b; voice-guide ADR-0076): a chunk of its own, loaded
 * when its template is chosen (./registry.js). Vodafone's faces, the experiences' shared sheet and its own, as text,
 * once each on the page (ensureCss); its renderer through the mount wrapper the clone uses too. Its scene pins in the
 * box while the story scrolls over it; the story's links take no pointer events while they pass under a bottom corner
 * (journey.js keepClear(), the box's safe zones) and the app band keeps over the corners at the box's end
 * (journey.css). Its own h1 is the view's; its sun mark is the page's symbol or ours (the shell adds a missing one).
 */
import faces from '../../vodafone-faces.css'
import shared from '../../../aixc/experiences/vodafone.css'
import css from '../../../aixc/experiences/journey.css'
import { renderJourney } from '../../../aixc/experiences/journey.js'
import { wrapExperience } from '../../../aixc/experience-wrap.js'

export const load = ({ ensureCss }) => {
  ensureCss('vodafone-faces', faces)
  ensureCss('vx-shared', shared)
  ensureCss('vx-journey', css)
  return (schema, index, options) => wrapExperience(renderJourney(schema, index, options))
}
