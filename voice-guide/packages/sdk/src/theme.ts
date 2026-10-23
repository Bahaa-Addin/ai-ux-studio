/**
 * Brand from the host page (ADR-0020): the accent is the background of the
 * page's own primary buttons, the font is the page's body font. A site can
 * override with ui.accent in its config. Nothing is invented.
 */
export interface Theme {
	accent: string
	accentInk: string
	font: string
	radius: string
}

function parseRgb(c: string): [number, number, number, number] | null {
	const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/.exec(c)
	return m ? [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])] : null
}

function luminance([r, g, b]: number[]): number {
	const f = (v: number) => {
		const s = v / 255
		return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
	}
	return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

/** A colour is usable as an accent when it is opaque and neither near-white nor near-black. */
function usable(c: string): boolean {
	const rgb = parseRgb(c)
	if (!rgb || rgb[3] < 0.9) return false
	const l = luminance(rgb)
	const [r, g, b] = rgb
	const chroma = Math.max(r, g, b) - Math.min(r, g, b)
	return l > 0.02 && l < 0.85 && chroma > 24
}

export function themeFromPage(override?: string): Theme {
	const body = getComputedStyle(document.body)
	let accent = override || ''
	let radius = '12px'
	if (!accent) {
		const cands = document.querySelectorAll('.btn, button, [class*="btn"], [class*="button"], a[role="button"], input[type="submit"]')
		for (const el of cands) {
			if (el.closest('vg-guide')) continue
			const cs = getComputedStyle(el)
			if (usable(cs.backgroundColor)) {
				accent = cs.backgroundColor
				if (cs.borderRadius && cs.borderRadius !== '0px') radius = Number.parseFloat(cs.borderRadius) > 20 ? '999px' : cs.borderRadius
				break
			}
		}
	}
	if (!accent) {
		const link = document.querySelector('a[href]')
		const c = link ? getComputedStyle(link).color : ''
		accent = usable(c) ? c : '#0b6e6e'
	}
	const rgb = parseRgb(accent)
	const accentInk = rgb && luminance(rgb) > 0.45 ? '#111111' : '#ffffff'
	return { accent, accentInk, font: body.fontFamily || 'system-ui, sans-serif', radius }
}
