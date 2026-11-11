/**
 * Sentences of a spoken line (ADR-0047 §3), shared by the page (voice-out.js) and the speech-out
 * service: both must cut a reply the same way, or audio made ahead never matches what the page asks.
 *
 * A line is split after . ! ? ؟ … or a line break when space follows, so "1.5 GB" and "EGP 1,250.50"
 * stay whole; pieces shorter than MIN_CHARS join their neighbour; a piece over `max` is cut at a
 * comma (، or ,), then at a space.
 */

const MIN_CHARS = 12

/** The form a line is cached and compared in: Unicode NFC, runs of space as one, trimmed. */
export function canonicalSpeech(text: string): string {
	return text.normalize('NFC').replace(/\s+/g, ' ').trim()
}

const cut = (piece: string, max: number): string[] => {
	if (piece.length <= max) return [piece]
	for (const mark of [/[،,]\s/g, /\s/g]) {
		let at = -1
		for (const m of piece.matchAll(mark)) if (m.index! + m[0].length <= max) at = m.index! + m[0].length
		if (at > 0) return [piece.slice(0, at).trim(), ...cut(piece.slice(at).trim(), max)]
	}
	return [piece.slice(0, max), ...cut(piece.slice(max), max)]
}

export function splitSentences(text: string, max = 400): string[] {
	const line = text.normalize('NFC').trim()
	if (!line) return []
	const raw = line
		.split(/(?<=[.!?؟…])\s+|\n+/)
		.map(canonicalSpeech)
		.filter(Boolean)
	const merged: string[] = []
	for (const piece of raw) {
		const last = merged.length - 1
		if (last >= 0 && (piece.length < MIN_CHARS || merged[last].length < MIN_CHARS)) merged[last] = `${merged[last]} ${piece}`
		else merged.push(piece)
	}
	return merged.flatMap((piece) => cut(piece, max))
}
