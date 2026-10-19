/**
 * Experience registry. Each experience is a plugin that turns a validated schema
 * plus the content index into a DOM subtree. Adding a new experience means adding
 * an entry here and allowing its name in schema-validator.js; the content model,
 * page adapters and Gemini client stay unchanged.
 */

import { renderMagazine } from './experiences/magazine.js'

const experiences = {
  magazine: { label: 'Magazine experience', render: renderMagazine },
}

export const experienceLabel = (name) => experiences[name]?.label ?? 'Reimagined view'

/**
 * @returns {{ element: HTMLElement, afterMount: Function[] }}
 */
export const renderExperience = (schema, index, options = {}) => {
  const experience = experiences[schema.experience]
  if (!experience) throw new Error(`AIXC: no renderer for experience "${schema.experience}"`)
  return experience.render(schema, index, options)
}
