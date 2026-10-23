/**
 * Word-by-word transcript model (SPEC-02 §4, ADR-0027). Speech engines send whole phrases and
 * revise them; the bar must still read like words arriving one at a time. Pure functions only,
 * so the rules are unit-tested without a browser.
 */

export interface Word {
	text: string
	final: boolean
}

export interface WordDiff {
	/** Words at the start that did not change at all (no DOM work). */
	keep: number
	/** Words that changed text or finality in place: index and new value. */
	change: { index: number; word: Word }[]
	/** Words added at the end, in order (animated in one by one). */
	append: Word[]
	/** Words that disappeared from the end (the engine took them back). */
	remove: number
}

export function tokenize(text: string): string[] {
	return text.trim().split(/\s+/).filter(Boolean)
}

/** Final words first, then interim ones, as the bar shows them. */
export function wordsOf(finalText: string, interimText: string): Word[] {
	return [...tokenize(finalText).map((text) => ({ text, final: true })), ...tokenize(interimText).map((text) => ({ text, final: false }))]
}

export function diffWords(prev: Word[], next: Word[]): WordDiff {
	let keep = 0
	while (keep < prev.length && keep < next.length && prev[keep].text === next[keep].text && prev[keep].final === next[keep].final) keep++
	const change: WordDiff['change'] = []
	const overlap = Math.min(prev.length, next.length)
	for (let i = keep; i < overlap; i++) {
		if (prev[i].text !== next[i].text || prev[i].final !== next[i].final) change.push({ index: i, word: next[i] })
	}
	return { keep, change, append: next.slice(overlap), remove: Math.max(0, prev.length - next.length) }
}
