/**
 * Renders a watched page in a real browser and reads the watched section
 * (ADR-0023). Same rendering as the crawler, so a section that is drawn by
 * JavaScript is seen the same way the guide saw it.
 */
import { createHash } from 'node:crypto'

import { type Browser, chromium } from 'playwright'

import type { Target } from '#kb'

export interface Snapshot {
	found: boolean
	text: string
	hash: string
}

export function hashText(text: string): string {
	return createHash('sha256').update(text).digest('hex').slice(0, 32)
}

/** Whitespace-insensitive, so reflowed HTML is not a change. */
export function normalizeSectionText(t: string): string {
	return t.replace(/\s+/g, ' ').trim()
}

export class Checker {
	#browser: Promise<Browser> | null = null
	readonly cookies: { url: string; name: string; value: string }[]

	constructor(cookies: { url: string; name: string; value: string }[] = []) {
		this.cookies = cookies
	}

	async read(url: string, target: Target): Promise<Snapshot> {
		if (!this.#browser) this.#browser = chromium.launch()
		const browser = await this.#browser
		const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
		try {
			if (this.cookies.length) await ctx.addCookies(this.cookies)
			await ctx.route('**/*', (r) => (['image', 'media', 'font'].includes(r.request().resourceType()) ? r.abort() : r.continue()))
			const page = await ctx.newPage()
			await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 })
			const text = await page.evaluate((css: string[]) => {
				for (const c of css) {
					try {
						const el = document.querySelector(c)
						if (el) return (el as HTMLElement).innerText || el.textContent || ''
					} catch {}
				}
				return null
			}, target.css)
			if (text === null) return { found: false, text: '', hash: '' }
			const norm = normalizeSectionText(text)
			return { found: true, text: norm, hash: hashText(norm) }
		} finally {
			await ctx.close()
		}
	}

	async close() {
		if (this.#browser) await (await this.#browser).close()
		this.#browser = null
	}
}
