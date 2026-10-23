/**
 * Voice-first UI rules that do not need a browser (SPEC-01, SPEC-02, ADR-0027, ADR-0029): the
 * word-by-word transcript diff, the waveform level and smoothing, and the Vodafone palette.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { VODAFONE_CSS, VODAFONE_THEME } from '../../packages/sdk/src/theme/vodafone.ts'
import { levelFromRms, smooth } from '../../packages/sdk/src/voice/audio.ts'
import { LAUNCHER_CSS } from '../../packages/sdk/src/voice/launcher.ts'
import { diffWords, tokenize, wordsOf } from '../../packages/sdk/src/voice/words.ts'

test('words: final words first, then interim ones', () => {
	assert.deepEqual(tokenize('  إيه   أرخص\tباقة '), ['إيه', 'أرخص', 'باقة'])
	assert.deepEqual(wordsOf('إيه أرخص', 'باقة نت'), [
		{ text: 'إيه', final: true },
		{ text: 'أرخص', final: true },
		{ text: 'باقة', final: false },
		{ text: 'نت', final: false },
	])
})

test('words: a growing phrase only appends, so each new word animates in once', () => {
	const a = wordsOf('', 'إيه')
	const b = wordsOf('', 'إيه أرخص')
	const c = wordsOf('', 'إيه أرخص باقة')
	assert.deepEqual(diffWords(a, b), { keep: 1, change: [], append: [{ text: 'أرخص', final: false }], remove: 0 })
	assert.deepEqual(diffWords(b, c), { keep: 2, change: [], append: [{ text: 'باقة', final: false }], remove: 0 })
})

test('words: the engine revising a word changes it in place; taking words back removes them', () => {
	const before = wordsOf('', 'what is the cheap')
	const after = wordsOf('', 'what is the cheapest bundle')
	const d = diffWords(before, after)
	assert.equal(d.keep, 3)
	assert.deepEqual(d.change, [{ index: 3, word: { text: 'cheapest', final: false } }])
	assert.deepEqual(d.append, [{ text: 'bundle', final: false }])
	assert.equal(d.remove, 0)
	const shorter = diffWords(after, wordsOf('', 'what is'))
	assert.equal(shorter.remove, 3)
	assert.deepEqual(shorter.append, [])
})

test('words: an interim word becoming final is a change, not a new word', () => {
	const d = diffWords(wordsOf('', 'show me'), wordsOf('show me', ''))
	assert.equal(d.append.length, 0)
	assert.equal(d.remove, 0)
	assert.deepEqual(
		d.change.map((c) => c.word),
		[
			{ text: 'show', final: true },
			{ text: 'me', final: true },
		],
	)
})

test('waveform level: silence is 0, normal speech is clearly visible, loud speech caps at 1', () => {
	assert.equal(levelFromRms(0), 0)
	assert.ok(levelFromRms(0.03) > 0.3, `quiet speech ${levelFromRms(0.03)}`)
	assert.ok(levelFromRms(0.06) > 0.5)
	assert.equal(levelFromRms(0.5), 1)
	// Monotonic.
	let prev = -1
	for (let r = 0; r <= 0.2; r += 0.01) {
		const l = levelFromRms(r)
		assert.ok(l >= prev)
		prev = l
	}
})

test('waveform smoothing: fast attack (40 ms), slower release (180 ms)', () => {
	// After one 16 ms frame the level rises much more than it falls.
	const up = smooth(0, 1, 16)
	const down = 1 - smooth(1, 0, 16)
	assert.ok(up > 0.3 && up < 0.4, `attack ${up}`)
	assert.ok(down > 0.08 && down < 0.1, `release ${down}`)
	// About 63% of the way after one time constant.
	assert.ok(Math.abs(smooth(0, 1, 40) - (1 - Math.exp(-1))) < 1e-9)
	assert.ok(Math.abs(smooth(1, 0, 180) - Math.exp(-1)) < 1e-9)
})

/** SPEC-01 §2: the only colours the guide may use (alpha variants of them are allowed). */
const PALETTE = ['#e60000', '#990000', '#333333', '#666666', '#999999', '#f4f4f4', '#ffffff', '#cccccc', '#14141e', '#00b0ca', '#e6e6e6', '#000000']

const rgbOf = (c: string): string => {
	const m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(c)
	if (m) return `#${[m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('')}`
	const h = c.slice(1).toLowerCase()
	return `#${(h.length === 3 ? [...h].map((x) => x + x).join('') : h.slice(0, 6))}`
}

test('theme: the guide uses only Vodafone palette colours (no new colours, rule 8)', () => {
	for (const [name, css] of [
		['VODAFONE_CSS', VODAFONE_CSS],
		['LAUNCHER_CSS', LAUNCHER_CSS],
	] as const) {
		const colours = css.match(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g) || []
		const outside = [...new Set(colours.map(rgbOf))].filter((c) => !PALETTE.includes(c))
		assert.deepEqual(outside, [], `${name} uses colours outside SPEC-01: ${outside.join(', ')}`)
	}
})

test('theme: fixed tokens match SPEC-01 and the live accessibility button', () => {
	assert.equal(VODAFONE_THEME.accent, '#e60000')
	assert.equal(VODAFONE_THEME.radius, '6px')
	assert.match(VODAFONE_CSS, /--vf-red: #e60000/)
	assert.match(VODAFONE_CSS, /--vf-red-gradient: linear-gradient\(to right top, #990000, #e60000\)/)
	assert.match(VODAFONE_CSS, /--vf-font: vodafone-regular-en/)
	assert.match(VODAFONE_CSS, /\.root\[lang="ar"\] \{ --vf-font: vodafone-regular-ar/)
	// The mic matches the accessibility button's ring and glow (audit §5, SPEC-02 §2).
	assert.match(LAUNCHER_CSS, /border: 5px solid #fff/)
	assert.match(LAUNCHER_CSS, /rgba\(230,\s*0,\s*0,\s*\.35\)/)
	// The transcript bar is the black bar of SPEC-02.
	assert.match(LAUNCHER_CSS, /rgba\(0,\s*0,\s*0,\s*\.9\)/)
})
