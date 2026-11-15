/**
 * Minimal DOM builder. Everything AIXC renders goes through here so that text is
 * always assigned with textContent and attributes come from an explicit allowlist.
 * There is deliberately no way to pass raw HTML.
 */

const SVG_NS = 'http://www.w3.org/2000/svg'

const ALLOWED_ATTRIBUTES = new Set([
  'id', 'class', 'href', 'src', 'alt', 'width', 'height', 'loading', 'decoding', 'rel', 'target',
  'role', 'tabindex', 'hidden', 'type', 'title', 'lang', 'dir', 'for', 'name', 'value', 'placeholder',
  'rows', 'autocomplete', 'spellcheck', 'disabled', 'viewBox', 'focusable', 'fill', 'd', 'stroke',
  'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'datetime', 'inert',
])

const isAllowedAttribute = (name) =>
  ALLOWED_ATTRIBUTES.has(name) || name.startsWith('aria-') || name.startsWith('data-')

/** Only http(s) and same-origin paths may be used as link/image targets. */
export const safeUrl = (value) => {
  if (typeof value !== 'string' || !value.trim()) return null
  try {
    const url = new URL(value, window.location.origin)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null
  } catch {
    return null
  }
}

const applyAttributes = (element, attributes) => {
  for (const [name, value] of Object.entries(attributes ?? {})) {
    if (value === null || value === undefined || value === false) continue
    if (!isAllowedAttribute(name)) throw new Error(`AIXC dom: attribute "${name}" is not allowed`)
    let finalValue = value === true ? '' : String(value)
    if (name === 'href' || name === 'src') {
      finalValue = safeUrl(finalValue)
      if (!finalValue) continue
    }
    element.setAttribute(name, finalValue)
  }
}

const appendChildren = (element, children) => {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue
    element.append(child instanceof Node ? child : document.createTextNode(String(child)))
  }
}

/** h('p', { class: 'x' }, 'text', otherNode) */
export const h = (tag, attributes, ...children) => {
  const element = document.createElement(tag)
  applyAttributes(element, attributes)
  appendChildren(element, children)
  return element
}

export const svgIcon = (symbolId, className) => {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('class', className)
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('focusable', 'false')
  const use = document.createElementNS(SVG_NS, 'use')
  use.setAttribute('href', `#${symbolId}`)
  svg.append(use)
  return svg
}

/** Small inline path icon (for UI chrome that is not part of the Vodafone sprite). */
export const pathIcon = (pathData, className, viewBox = '0 0 24 24') => {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('class', className)
  svg.setAttribute('viewBox', viewBox)
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('focusable', 'false')
  const path = document.createElementNS(SVG_NS, 'path')
  path.setAttribute('d', pathData)
  path.setAttribute('fill', 'currentColor')
  svg.append(path)
  return svg
}

export const visuallyHidden = (text) => h('span', { class: 'aixc-sr-only' }, text)

/** Turns arbitrary text into a safe id fragment. */
export const slug = (value) =>
  String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'x'
