/**
 * Contrast of every text style in the guide's Vodafone CSS (SPEC-01 acceptance 4): ≥ 4.5:1, or
 * ≥ 3:1 for large text. Rules that set both a text colour and a solid background are checked
 * as written; text over the page or a translucent bar is checked against what is behind it.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { VODAFONE_CSS } from '../../packages/sdk/src/theme/vodafone.ts'
import { LAUNCHER_CSS } from '../../packages/sdk/src/voice/launcher.ts'
import { XRAY_CSS } from '../../packages/sdk/src/xray-css.ts'

const VARS: Record<string, string> = { '--vf-red': '#e60000', '--vf-red-dark': '#990000', '--vf-ink': '#333333', '--vf-ink-2': '#666666', '--vf-bg': '#f4f4f4', '--vf-surface': '#ffffff', '--vf-night': '#14141e' }

const hex = (c: string): [number, number, number] => {
	const h = c.replace('#', '')
	const f = h.length === 3 ? [...h].map((x) => x + x).join('') : h
	return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16)) as [number, number, number]
}
const lum = ([r, g, b]: [number, number, number]) => {
	const ch = (v: number) => {
		const s = v / 255
		return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
	}
	return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b)
}
export const contrast = (a: string, b: string) => {
	const [x, y] = [lum(hex(a)), lum(hex(b))].sort((p, q) => q - p)
	return (x + 0.05) / (y + 0.05)
}
const resolve = (v: string) => {
	const m = /var\((--[\w-]+)/.exec(v)
	return (m ? VARS[m[1]] : v.trim()) || ''
}

test('every rule with a text colour on a solid background passes AA', () => {
	const checked: string[] = []
	for (const css of [VODAFONE_CSS, LAUNCHER_CSS, XRAY_CSS])
		for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
			const body = m[2]
			const color = /(?:^|;)\s*color:\s*([^;]+)/.exec(body)?.[1]
			const bg = /background(?:-color)?:\s*([^;]+)/.exec(body)?.[1]
			if (!color || !bg) continue
			const [c, b] = [resolve(color), resolve(bg)]
			if (!/^#[0-9a-f]{3,6}$/i.test(c) || !/^#[0-9a-f]{3,6}$/i.test(b)) continue
			const large = /font-size:\s*(1[89]|[2-9]\d)px/.test(body)
			const r = contrast(c, b)
			assert.ok(r >= (large ? 3 : 4.5), `${m[1].trim()}: ${c} on ${b} is ${r.toFixed(2)}:1`)
			checked.push(m[1].trim())
		}
	assert.ok(checked.length >= 5, `checked ${checked.join(', ')}`)
})

test('text over translucent or page backgrounds passes AA against what is behind it', () => {
	const pairs: [string, string, string][] = [
		['transcript bar: white words on 90% black over a white page', '#ffffff', '#1a1a1a'],
		['panel: body text on white', '#333333', '#ffffff'],
		['panel: user turn on the light grey', '#333333', '#f4f4f4'],
		['secondary text on white', '#666666', '#ffffff'],
		['chip: red text on white', '#e60000', '#ffffff'],
		['header: white on the red gradient, darkest end', '#ffffff', '#990000'],
		['header: white on the red gradient, lightest end (text 16px bold)', '#ffffff', '#e60000'],
		['X-ray: event text on night', '#e6e6e6', '#14141e'],
		['X-ray: times on night', '#cccccc', '#14141e'],
	]
	for (const [what, fg, bg] of pairs) assert.ok(contrast(fg, bg) >= 4.5, `${what}: ${contrast(fg, bg).toFixed(2)}:1`)
})
