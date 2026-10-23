/**
 * The crawler's extractPage() alone, for taking pages one at a time in a browser tab (ADR-0032):
 * single-page-app views that only render as the top document. Defines globalThis.__vgExtract.
 */
import { extractPage } from '../../jobs/crawler/extract.ts'

;(globalThis as any).__vgExtract = (opts: { minItems: number; ignore?: string[] }) => {
	for (const sel of opts.ignore || []) for (const el of document.querySelectorAll(sel)) el.remove()
	const snap = extractPage({ minItems: opts.minItems }) as any
	snap.status = 200
	return snap
}
