/**
 * The flipbook on Vodafone's own pages (live plan phase 4b; voice-guide ADR-0076): a chunk of its own, loaded when its
 * template is chosen (./registry.js). Vodafone's faces, the experiences' shared sheet and its own, as text, once each
 * on the page (ensureCss); its renderer through the mount wrapper the clone uses too. The book turns its pages in place
 * (it does not pin), keeps beside the bottom corners, its controls between them (above the book on phones), and what
 * of it meets a corner is not pressable there (flipbook.css, flipbook.js keepClear() and placeRow(), the box's safe
 * zones); its contents links scroll the box, never the window or the address.
 */
import faces from '../../vodafone-faces.css'
import shared from '../../../aixc/experiences/vodafone.css'
import css from '../../../aixc/experiences/flipbook.css'
import { renderFlipbook } from '../../../aixc/experiences/flipbook.js'
import { wrapExperience } from '../../../aixc/experience-wrap.js'

export const load = ({ ensureCss }) => {
  ensureCss('vodafone-faces', faces)
  ensureCss('vx-shared', shared)
  ensureCss('vx-flipbook', css)
  return (schema, index, options) => wrapExperience(renderFlipbook(schema, index, options))
}
