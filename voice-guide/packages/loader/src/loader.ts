/**
 * The loader (ADR-0026, ADR-0048, ADR-0053): the few lines that put the guide and the experience
 * layer on a page. Every carrier runs the same code: the demo browser (Playwright addInitScript),
 * the public demo extension (a MAIN-world content script at document_start) and, one day, Vodafone's
 * Tealium tag (mode A). Only the options differ.
 *
 * - guide.js on every top-level page of an allowed origin;
 * - the experience layer, aixc.js (ADR-0048), on the web origin's matching pages that have
 *   #main-content, unless the URL says ?aixc=off;
 * - first of all, the storage keeper: Vodafone's pages call localStorage.clear() on load (theme
 *   scripts.js, found 2026-11-03), which would forget the person's trail consent, the guide's
 *   settings and the layer's own (Tips seen, the demo profile). clear() keeps keys that start with
 *   `vg-`, `vg:` or `aixc.`; everything else is cleared as Vodafone intends (T-806). It only works
 *   when the loader runs before the page's own scripts (document_start, or addInitScript).
 *
 * The output is a self-contained script (a string), so it can be injected as is.
 */

/** Where the loader adds the experience layer (ADR-0048); null: nowhere. */
export interface LoaderExperiences {
	/** The site's first (web) origin only, never the shop. */
	origin: string
	/** Regular expressions on the path. */
	paths: string[]
	/** Paths the clone is mounted on in replay (it runs the demos itself until phase 9). */
	exclude: string[]
	/** Enabled demos, passed to the layer. */
	demos: string[]
}

export interface LoaderOptions {
	siteKey: string
	/** Page origins the loader runs on. */
	origins: string[]
	/**
	 * The gateway, as an absolute URL (https://guide.example.com). Omitted: the page's own origin
	 * plus /__vg, which only the demo browser answers (ADR-0031).
	 */
	gateway?: string
	/** 'poll' for the demo browser's routed gateway; omitted: server-sent events (ADR-0031). */
	events?: 'poll'
	xray?: string
	experiences?: LoaderExperiences | null
	/** Keep the guide's and the layer's localStorage keys through the page's clear(). Default: true. */
	keepStorage?: boolean
}

/** Key prefixes the storage keeper protects from the page's localStorage.clear(). */
export const KEPT_PREFIXES = ['vg-', 'vg:', 'aixc.']

/** The storage keeper on its own, as a script: idempotent, top-level documents only. */
export const KEEP_GUIDE_STORAGE = `(() => { try {
	if (window.top !== window) return
	const P = Storage.prototype, clear = P.clear
	if (clear.__vgKeep) return
	const kept = ${JSON.stringify(KEPT_PREFIXES)}
	const keep = function () {
		if (this !== window.localStorage) return clear.call(this)
		const saved = []
		for (let i = 0; i < this.length; i++) { const k = this.key(i); if (k && kept.some((p) => k.startsWith(p))) saved.push([k, this.getItem(k)]) }
		clear.call(this)
		for (const [k, v] of saved) this.setItem(k, v)
	}
	keep.__vgKeep = true
	P.clear = keep
} catch (e) {} })()`

export function loaderScript(o: LoaderOptions): string {
	const gateway = o.gateway ? o.gateway.replace(/\/$/, '') : null
	if (gateway && !/^https?:\/\//.test(gateway)) throw new Error(`loader: gateway must be an absolute URL, got ${gateway}`)
	return `(() => { try {
	if (window.top !== window) return
	if (!${JSON.stringify(o.origins)}.includes(location.origin)) return
	if (window.__vgLoader) return
	window.__vgLoader = true
	;${o.keepStorage === false ? '' : KEEP_GUIDE_STORAGE}
	const base = ${JSON.stringify(gateway)} || location.origin + '/__vg'
	const add = () => {
		if (document.querySelector('script[data-vg-loader]')) return
		const s = document.createElement('script')
		s.src = base + '/sdk/guide.js'
		s.async = true
		s.dataset.siteKey = ${JSON.stringify(o.siteKey)}
		${o.events === 'poll' ? `s.dataset.events = 'poll'` : ''}
		s.dataset.vgLoader = '1'
		${o.xray ? `s.dataset.xray = ${JSON.stringify(o.xray)}` : ''}
		;(document.head || document.documentElement).appendChild(s)
	}
	const x = ${JSON.stringify(o.experiences ?? null)}
	const addLayer = () => {
		if (!x || location.origin !== x.origin || /[?&]aixc=off(&|$)/.test(location.search)) return
		if (!document.getElementById('main-content') || document.querySelector('script[data-aixc-demo]')) return
		if (x.exclude.includes(location.pathname.replace(/\\/$/, '')) || !x.paths.some((p) => new RegExp(p).test(location.pathname))) return
		const m = document.createElement('script')
		m.type = 'module'
		m.src = base + '/sdk/aixc/aixc.js'
		m.dataset.aixcDemo = '1'
		m.dataset.aixcDemos = x.demos.join(' ')
		m.dataset.aixcSiteKey = ${JSON.stringify(o.siteKey)}
		;(document.head || document.documentElement).appendChild(m)
	}
	const both = () => {
		add()
		try { addLayer() } catch (e) {}
	}
	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', both, { once: true })
	else both()
} catch (e) {} })()`
}
