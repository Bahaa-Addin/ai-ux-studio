/** The guide's SVG icons, shared by the panel and the microphone launcher (one copy each, T-504). */
export const svg = (inner: string): string => `<svg viewBox="0 0 24 24" aria-hidden="true">${inner}</svg>`
export const icon = (d: string): string => svg(`<path fill="currentColor" d="${d}"/>`)
export const MIC = icon('M12 15a3.5 3.5 0 0 0 3.5-3.5v-6a3.5 3.5 0 1 0-7 0v6A3.5 3.5 0 0 0 12 15Zm6.5-3.5a.75.75 0 0 0-1.5 0 5 5 0 0 1-10 0 .75.75 0 0 0-1.5 0 6.5 6.5 0 0 0 5.75 6.46V20.5H9a.75.75 0 0 0 0 1.5h6a.75.75 0 0 0 0-1.5h-2.25v-2.54A6.5 6.5 0 0 0 18.5 11.5Z')
