/**
 * Page adapter registry.
 *
 * A page adapter is the only page-specific code AIXC needs. Contract:
 *
 *   {
 *     pageId: string,                       // stable id, also used in cache keys
 *     label: string,                        // human name for UI/status text
 *     renderOriginal(sourceRoot): void,     // draws the original content presentation
 *     extractContent(sourceRoot): {         // returns the normalized content model
 *       model: PageModel | null,            //   (see src/content/vodafone-services.js)
 *       problems: string[]                  //   non-fatal issues found while extracting
 *     }
 *   }
 *
 * The protected shell (header, navigation, footer) is rendered by src/shell.js and
 * is never passed to adapters or experiences.
 *
 * To add a page: write src/content/<page>.js (model) and src/adapters/<page>.js
 * (adapter), then register it below. Experiences and the Gemini client need no change.
 */

import { vodafoneServicesAdapter } from '../adapters/vodafone-services.js'

const adapters = new Map([[vodafoneServicesAdapter.pageId, vodafoneServicesAdapter]])

export const getPageAdapter = (pageId) => adapters.get(pageId) ?? vodafoneServicesAdapter

export const listPageAdapters = () => [...adapters.values()]
