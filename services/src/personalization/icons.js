/**
 * 24×24 stroke icons for the RED world, drawn in the Pocket's icon style (2px round strokes,
 * currentColor). Drawn for this project, not taken from an icon set.
 */

const SVG_NS = 'http://www.w3.org/2000/svg'

const PATHS = {
  data: ['M7 17V7M4 10l3-3 3 3', 'M17 7v10M14 14l3 3 3-3'],
  minutes: ['M6.6 3.5h2.6l1.4 4-2 1.3a10.5 10.5 0 0 0 6.6 6.6l1.3-2 4 1.4v2.6a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.6 5.7a2 2 0 0 1 2-2.2z'],
  sms: ['M4.5 5.5h15v10h-8.5L7 19.5v-4H4.5z', 'M8.5 9.5h7M8.5 12.5h4.5'],
  dsl: ['M4.5 13.5h15v5h-15z', 'M8 16h.01M11 16h.01', 'M8.5 9.5a5 5 0 0 1 7 0', 'M6 7a8.5 8.5 0 0 1 12 0'],
  bill: ['M6 3.5h12v17l-2.5-1.5-2 1.5-1.5-1.5-1.5 1.5-2-1.5L6 20.5z', 'M9 8h6M9 11.5h6M9 15h3.5'],
  points: ['M12 3.5l2.5 5.2 5.7.8-4.1 4 1 5.7-5.1-2.7-5.1 2.7 1-5.7-4.1-4 5.7-.8z'],
  family: ['M8.5 11a3 3 0 1 0 0-6 3 3 0 1 0 0 6', 'M3 20a5.5 5.5 0 0 1 11 0', 'M16 11.5a2.5 2.5 0 1 0 0-5', 'M16.5 14.5A4.5 4.5 0 0 1 21 19'],
  roaming: ['M3.5 13.5 21 7.5l-1.2-1.6a2 2 0 0 0-2.2-.6L13 6.9 7.5 3.5 5.6 4.3l3.2 4.3-4 1.4-2-1.4-1 .5 1.7 4.4z', 'M3.5 20.5h17'],
  wifi: ['M5 10a10 10 0 0 1 14 0', 'M8 13a6 6 0 0 1 8 0', 'M12 16.5h.01'],
  chevronUp: ['M6.5 14.5 12 9l5.5 5.5'],
  chevronDown: ['M6.5 9.5 12 15l5.5-5.5'],
  chevronRight: ['M9.5 6.5 15 12l-5.5 5.5'],
  plus: ['M12 5.5v13M5.5 12h13'],
  check: ['M5.5 12.5l4 4 9-9'],
  close: ['M7 7l10 10M17 7 7 17'],
  info: ['M12 21a9 9 0 1 0 0-18 9 9 0 1 0 0 18', 'M12 11v5.5M12 7.5h.01'],
  pin: ['M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z', 'M12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 1 0 0 5'],
  directions: ['M12 3 21 12l-9 9-9-9z', 'M10 14v-2.5a1.5 1.5 0 0 1 1.5-1.5H15M13 8l2 2-2 2'],
  calendar: ['M4.5 6.5h15v13h-15z', 'M4.5 10.5h15M8.5 4v4M15.5 4v4'],
  ticket: ['M4 7.5h16v3a1.5 1.5 0 0 0 0 3v3H4v-3a1.5 1.5 0 0 0 0-3z', 'M14.5 7.5v9'],
  gift: ['M4.5 10h15v10h-15z', 'M3.5 7h17v3h-17z', 'M12 7v13', 'M12 7c-1.5-3.5-5-3.5-5-1.5S10 7 12 7zm0 0c1.5-3.5 5-3.5 5-1.5S14 7 12 7z'],
  expand: ['M14 4.5h5.5V10M19.5 4.5 13.5 10.5', 'M10 19.5H4.5V14M4.5 19.5l6-6'],
  copy: ['M8.5 8.5h11v11h-11z', 'M15.5 8.5v-4h-11v11h4'],
  external: ['M14 5h5v5', 'M19 5l-8 8', 'M17 14v5H5V7h5'],
  sparkle: ['M12 3.5c.6 4.2 2.3 5.9 6.5 6.5-4.2.6-5.9 2.3-6.5 6.5-.6-4.2-2.3-5.9-6.5-6.5 4.2-.6 5.9-2.3 6.5-6.5z', 'M19 15.5c.2 1.6.9 2.3 2.5 2.5-1.6.2-2.3.9-2.5 2.5-.2-1.6-.9-2.3-2.5-2.5 1.6-.2 2.3-.9 2.5-2.5z'],
  play: ['M8.5 5.5v13l10.5-6.5z'],
  pocket: ['M5 4h14v9.5L12 20l-7-6.5z', 'M8.5 8h7'],
  bolt: ['M13 3 5 13.5h6L10 21l8-10.5h-6z'],
  lock: ['M7 11V8a5 5 0 0 1 10 0v3', 'M5.5 11h13v9h-13z'],
  arrowRight: ['M5 12h14M13.5 6.5 19 12l-5.5 5.5'],
}

export const icon = (name, className = '') => {
  const svg = document.createElementNS(SVG_NS, 'svg')
  for (const [key, value] of Object.entries({
    viewBox: '0 0 24 24',
    class: className,
    'aria-hidden': 'true',
    focusable: 'false',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '2',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
  })) {
    if (value) svg.setAttribute(key, value)
  }
  for (const d of PATHS[name] ?? PATHS.sparkle) {
    const path = document.createElementNS(SVG_NS, 'path')
    path.setAttribute('d', d)
    svg.append(path)
  }
  return svg
}

export const ICON_NAMES = Object.keys(PATHS)
