/**
 * Tips: icons (voice-guide ADR-0045). The same shapes the demos use, so a tip shows the control
 * you will meet: the guide's microphone and keyboard (voice-guide `icons.ts`, `launcher.ts`),
 * the Pocket's pocket (`pocket.js`), Reimagine's sparkle (`controller.js`) and the journey's
 * thread and lock (voice-guide `trail/view.ts`). 24×24.
 */

const SVG_NS = 'http://www.w3.org/2000/svg'

// [paths, 'fill' | 'stroke']
const ICONS = {
  mic: [['M12 15a3.5 3.5 0 0 0 3.5-3.5v-6a3.5 3.5 0 1 0-7 0v6A3.5 3.5 0 0 0 12 15Zm6.5-3.5a.75.75 0 0 0-1.5 0 5 5 0 0 1-10 0 .75.75 0 0 0-1.5 0 6.5 6.5 0 0 0 5.75 6.46V20.5H9a.75.75 0 0 0 0 1.5h6a.75.75 0 0 0 0-1.5h-2.25v-2.54A6.5 6.5 0 0 0 18.5 11.5Z'], 'fill'],
  keyboard: [['M4 6h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Zm1 3v2h2V9H5Zm4 0v2h2V9H9Zm4 0v2h2V9h-2Zm4 0v2h2V9h-2ZM7 13v2h10v-2H7Z'], 'fill'],
  speaker: [['M4 9v6h4l5 5V4L8 9H4Zm12.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4Zm-2.5-8.77v2.06A7 7 0 0 1 19 12a7 7 0 0 1-5 6.71v2.06A9 9 0 0 0 21 12a9 9 0 0 0-7-8.77Z'], 'fill'],
  pocket: [['M5 4h14v9.5L12 20l-7-6.5z', 'M8.5 8h7'], 'stroke'],
  sparkle: [['M11 2.5 13.1 9 19.5 11l-6.4 2.1L11 19.5 8.9 13.1 2.5 11 8.9 9zM19 2l.9 2.6 2.6.9-2.6.9L19 9l-.9-2.6-2.6-.9 2.6-.9z'], 'fill'],
  journey: [['M5 4a2 2 0 1 1 0 4 2 2 0 0 1 0-4Zm14 12a2 2 0 1 1 0 4 2 2 0 0 1 0-4ZM6 9h7a4 4 0 0 1 0 8H8v-2h5a2 2 0 0 0 0-4H6a4 4 0 0 1 0-8h1v2H6a2 2 0 0 0 0 4Z'], 'fill'],
  lock: [['M7 10V8a5 5 0 0 1 10 0v2h1a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h1Zm2 0h6V8a3 3 0 0 0-6 0v2Z'], 'fill'],
  pause: [['M7 5h4v14H7zm6 0h4v14h-4z'], 'fill'],
  check: [['M5 12.5l4.5 4.5L19 7.5'], 'stroke'],
  close: [['M18.3 7.1 16.9 5.7 12 10.6 7.1 5.7 5.7 7.1l4.9 4.9-4.9 4.9 1.4 1.4 4.9-4.9 4.9 4.9 1.4-1.4-4.9-4.9z'], 'fill'],
  back: [['M14.5 5.5 8 12l6.5 6.5'], 'stroke'],
  next: [['M9.5 5.5 16 12l-6.5 6.5'], 'stroke'],
  bulb: [['M9.5 18h5', 'M10.5 21h3', 'M12 3a6 6 0 0 0-3.7 10.7c.7.6 1.2 1.4 1.2 2.3h5c0-.9.5-1.7 1.2-2.3A6 6 0 0 0 12 3Z'], 'stroke'],
  arrow: [['M5 12h13', 'M13 6.5 18.5 12 13 17.5'], 'stroke'],
}

/** An inline SVG icon, hidden from assistive tech (the control's text names it). */
export const icon = (name, className = '') => {
  const [paths, mode] = ICONS[name] ?? ICONS.bulb
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('focusable', 'false')
  if (className) svg.setAttribute('class', className)
  if (mode === 'stroke') {
    svg.setAttribute('fill', 'none')
    svg.setAttribute('stroke', 'currentColor')
    svg.setAttribute('stroke-width', '2')
    svg.setAttribute('stroke-linecap', 'round')
    svg.setAttribute('stroke-linejoin', 'round')
  } else {
    svg.setAttribute('fill', 'currentColor')
  }
  for (const d of paths) {
    const path = document.createElementNS(SVG_NS, 'path')
    path.setAttribute('d', d)
    svg.append(path)
  }
  return svg
}

/** The Vodafone speech mark, from the page's own sprite (src/shell.js). */
export const vodafoneMark = (className = '') => {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', '0 0 48 48')
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('focusable', 'false')
  if (className) svg.setAttribute('class', className)
  const use = document.createElementNS(SVG_NS, 'use')
  use.setAttribute('href', '#icon-vodafone-logo')
  svg.append(use)
  return svg
}

/** A template's own 24×24 icon (src/aixc/templates.js). */
export const pathIcon = (d, className = '') => {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('fill', 'currentColor')
  if (className) svg.setAttribute('class', className)
  const path = document.createElementNS(SVG_NS, 'path')
  path.setAttribute('d', d)
  svg.append(path)
  return svg
}

export { SVG_NS }
