/**
 * The experience layer on Vodafone's saved pages, as it would meet them live (live plan phase 3; the
 * phase 3 map, docs/reference/live-way2-phase3-map-2026-11-13.md). No clone, and nothing fetched from
 * the internet: the replay runs `offline`, and every request that would have left is recorded, so a
 * test can say none did. Replay runs none of Vodafone's scripts, so what they would add is stood in:
 *
 * - the accessibility widget in its real shape (rendered capture of /ar/services, 2026-11-05): a
 *   fixed, zero-size `<accessibility-widget>` host at the top of the stack holding
 *   `button#vodafone-aw-icon.vf-aw-fab` (right 20, bottom 20, 55×55), styled from a stylesheet with
 *   the specificity of Vodafone's own (a class and an attribute), so an id rule overrides it as live;
 * - OneTrust's first-visit banner (bottom-left in English, 375×321; bottom-right in Arabic, 375×360:
 *   Vodafone's Arabic face sets its copy on more lines, AIXC-61) and its
 *   full-page filter at z-index 2147483645; "Accept" and "Reject" hide both, as OneTrust does;
 * - the signed-out theme's `localStorage.clear()` on the pages whose theme does it (maintheme and
 *   static-theme: home, Services, RED, Vodafone Cash; not static-lite-theme), shortly after
 *   DOMContentLoaded (O23);
 * - Owl Carousel's layout of the carousels in #main-content: a stage of `.owl-item`s at the widths
 *   the carousel's own attributes give (Owl 2: the stage's width over `items`, less the margin, so 255 px
 *   at four in 1140 px, as the capture of 2026-11-05 measures), the first ones `.active`, and Owl's
 *   copies (`.owl-item.cloned`) before and after on looping carousels (RED live: 6). Not its motion;
 * - Vodafone's navigation pinned once the page scrolls (`.nav-header.nav-fixed`, z-index 20), on request:
 *   always pinned (`fixedHeader: true`), or pinned only while the page is scrolled and back in the flow at
 *   the top, as Vodafone's own script toggles it (`fixedHeader: 'scroll'`);
 * - Owl Carousel 2's AutoRefresh, on request (`owlAutoRefresh`, with `owl`): every 500 ms a carousel that is
 *   not visible by jQuery's rule gets `.owl-hidden` (opacity 0), which goes only on a poll that finds it
 *   visible again.
 *
 * The saved pages are served as recorded, their lazy pictures with `data-src` only (the demo browser's
 * `lazyImages: false`). Offline such a picture could only be a 1x1 blank, and its frame would stretch it
 * to a square: at 375 px the /en/home banner would be 375x375, where live it is about 227 px tall (live check of
 * 2026-11-17, floating-after shot 33), and the hero card would end 110 px below the guide's microphone
 * instead of just above it, as live. Recorded, the banner keeps to its alt text and the card ends at 630,
 * live about 658 (2026-11-22).
 */
import fs from 'node:fs'
import path from 'node:path'

import { chromium, type Page } from 'playwright'

import type { Manifest } from '#kb'
import { loadPlatformConfig, loadSiteConfig, ROOT, type SiteConfig } from '#shared/config.ts'

import { buildSdk } from '../../packages/sdk/build.ts'
import { createGateway } from '../../services/gateway/server.ts'
import { createServices } from '../../services/index.ts'
import { type DemoBrowser, launchDemoBrowser } from '../../tools/demo-browser.ts'
import { SPEECH_STUB } from './browser.ts'

export const V = 'https://web.vodafone.com.eg'
export const REPLAY = path.join(ROOT, 'fixtures/replay/vodafone-eg')
export const CMS_PAGES = (JSON.parse(fs.readFileSync(path.join(REPLAY, 'crawl.json'), 'utf8')) as { pages: { url: string; snapshot?: string }[] }).pages
	.filter((p) => p.snapshot && /^\/(en|ar)\//.test(new URL(p.url).pathname))
	.map((p) => new URL(p.url).pathname)
export const DESKTOP = { width: 1366, height: 900 }
export const PHONE = { width: 375, height: 812 }

let built: Promise<void> | null = null
/** The SDK and the layer, built once per test process. */
export const buildOnce = () => (built ??= buildSdk({ minify: true }).then(() => {}))

export interface LayerGateway {
	site: SiteConfig
	url: string
	close(): Promise<void>
}

/** A gateway with in-memory services and the committed knowledge base, on `port`. `trail` turns the Exploration Trail on. */
export async function startLayerGateway(port: number, o: { trail?: boolean } = {}): Promise<LayerGateway> {
	await buildOnce()
	const platform = loadPlatformConfig({ ...process.env, VG_VOICETUT_URL: '', VG_STORE: 'memory', VG_PORT: String(port), VG_PUBLIC_URL: `http://127.0.0.1:${port}` })
	const site = loadSiteConfig(path.join(platform.sitesDir, 'vodafone-eg.yaml'))
	if (o.trail) site.trail.enabled = true
	const services = await createServices({ platform, sites: new Map([[site.id, site]]) })
	const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/kb/vodafone-eg.manifest.json'), 'utf8')) as Manifest
	await services.store.putKbVersion(site.id, m)
	await services.store.activateKb(site.id, m.version.id)
	const gateway = createGateway({ services })
	await gateway.listen(port)
	return {
		site,
		url: `http://127.0.0.1:${port}`,
		close: async () => {
			await gateway.close()
			await services.close()
		},
	}
}

export interface LayerOptions {
	/** The accessibility widget in its real shape. Default true. */
	widget?: boolean
	/** OneTrust's first-visit banner and filter. Default false (the demo profile has answered it). */
	banner?: boolean
	/** The signed-out theme's localStorage.clear() where the page's theme does it. Default false. */
	themeClear?: boolean
	/** Owl Carousel's layout of the carousels. Default false. */
	owl?: boolean
	/** Vodafone's navigation pinned at the top, as after a scroll (true), or only while the page is scrolled ('scroll'). Default false. */
	fixedHeader?: boolean | 'scroll'
	/** Owl Carousel 2's AutoRefresh (needs `owl`): a carousel that is not visible fades out until a poll sees it again. Default false. */
	owlAutoRefresh?: boolean
	viewport?: { width: number; height: number }
	/**
	 * Classic scrollbars that take width, as the live walks' narrowed desktop Chrome has them (a 15 px scrollbar at
	 * 375 px: the page 360 px wide). Default false: Playwright's headless Chromium hides them (--hide-scrollbars).
	 */
	scrollbars?: boolean
	reducedMotion?: boolean
	/** The experience layer; false keeps it off. Default: the site config (on). */
	experiences?: boolean
	/**
	 * Demos turned off (or on) over the site config's `experiences.demos`, for this browser only: `{ reimagine: false }`
	 * leaves Reimagine's launcher out, as the site's own kill switch does. Default: the site config (every demo it enables).
	 */
	demos?: Partial<SiteConfig['experiences']['demos']>
	initScripts?: string[]
	/** Chromium's own network log goes to this file (to show nothing left, even as the browser closed). */
	netLog?: string
}

export interface Layer {
	b: DemoBrowser
	page: Page
	/** Requests offline replay refused or blanked: they would have gone to the internet without it. */
	refused: { url: string; type: string }[]
	/** Responses that came from a server other than the test's own gateway (none should). */
	reached: string[]
	close(): Promise<void>
}

export async function launchLayer(gw: LayerGateway, o: LayerOptions = {}): Promise<Layer> {
	const refused: { url: string; type: string }[] = []
	const reached: string[] = []
	// The kit's launch takes no option for the scrollbars: this one launch is made without --hide-scrollbars (as
	// pocket-portal-live's classic-scrollbar case does).
	const launch = chromium.launchPersistentContext
	if (o.scrollbars)
		chromium.launchPersistentContext = ((dir: string, options: Parameters<typeof launch>[1] = {}) =>
			launch.call(chromium, dir, { ...options, ignoreDefaultArgs: [...(Array.isArray(options.ignoreDefaultArgs) ? options.ignoreDefaultArgs : []), '--hide-scrollbars'] })) as typeof launch
	const b = await launchDemoBrowser({
		site: o.demos ? { ...gw.site, experiences: { ...gw.site.experiences, demos: { ...gw.site.experiences.demos, ...o.demos } } } : gw.site,
		gatewayUrl: gw.url,
		start: 'about:blank',
		headless: true,
		channel: 'chromium',
		xray: 'off',
		replayDir: REPLAY,
		offline: true,
		lazyImages: false,
		onNetwork: (url, type) => void refused.push({ url, type }),
		accessibilityStandIn: false,
		experiences: o.experiences,
		netLog: o.netLog,
		viewport: o.viewport || DESKTOP,
		initScripts: [SPEECH_STUB, ...(o.widget === false ? [] : [WIDGET_STAND_IN]), ...(o.banner ? [BANNER_STAND_IN] : []), ...(o.themeClear ? [THEME_CLEAR_STAND_IN] : []), ...(o.owl ? [OWL_STAND_IN] : []), ...(o.owlAutoRefresh ? [OWL_AUTO_REFRESH_STAND_IN] : []), ...(o.fixedHeader === 'scroll' ? [FIXED_HEADER_SCROLL_STAND_IN] : o.fixedHeader ? [FIXED_HEADER_STAND_IN] : []), ...(o.initScripts || [])],
	}).finally(() => {
		chromium.launchPersistentContext = launch
	})
	if (o.reducedMotion) await b.page.emulateMedia({ reducedMotion: 'reduce' })
	// A response a route fulfilled has no server address; one from the network has. The gateway's own
	// answers are fulfilled from the forward too, so any address at all means something left.
	b.context.on('response', (r) => {
		void r
			.serverAddr()
			.then((a) => {
				if (a) reached.push(r.url())
			})
			.catch(() => {})
	})
	return { b, page: b.page, refused, reached, close: () => b.close() }
}

/** Opens a saved page and waits until the layer has started (or the loader left it out). */
export async function open(page: Page, pathname: string, query = '') {
	await page.goto(`${V}${pathname}${query}`, { waitUntil: 'load' })
	await page.waitForFunction(() => document.querySelector('script[data-vg-loader]'), null, { timeout: 10_000 })
	await page.waitForTimeout(400)
}

/** Errors from the page and console lines from the layer. */
export function watch(page: Page) {
	const seen = { pageErrors: [] as string[], layer: [] as string[] }
	page.on('pageerror', (e) => seen.pageErrors.push(e.message))
	page.on('console', (m) => {
		if (m.text().startsWith('[AIXC]')) seen.layer.push(`${m.type()}: ${m.text()}`)
	})
	return seen
}

/** Where the layer stands on the page (with ?aixc-debug). */
export const layerState = (page: Page) =>
	page.evaluate(() => {
		const w = window as unknown as { __aixc?: { state: string; problem: string | null; settings: { demo: boolean; demos: string[] }; host: { lang: string; dir: string } | null; failure?: { step: string } | null; coverage?: { ratio: number }; model?: { sections: { destinationId?: string }[] }; pageMap?: { pageId: string | null; sections: number } | null; reads?: number } }
		const out = document.getElementById('experience-output')
		const bar = document.getElementById('aixc-viewbar')
		return {
			tag: !!document.querySelector('script[type="module"][data-aixc-demo]'),
			demo: w.__aixc?.settings.demo ?? null,
			demos: w.__aixc?.settings.demos ?? null,
			state: w.__aixc?.state ?? null,
			problem: w.__aixc?.problem ?? null,
			lang: w.__aixc?.host?.lang ?? null,
			dir: w.__aixc?.host?.dir ?? null,
			failure: w.__aixc?.failure?.step ?? null,
			regions: { output: out ? { hidden: out.hidden, afterMain: out.previousElementSibling?.id === 'main-content', marked: out.hasAttribute('data-aixc') && out.hasAttribute('data-vg') } : null, viewbar: bar ? { hidden: bar.hidden, beforeMain: bar.nextElementSibling?.id === 'main-content' } : null },
			added: document.querySelectorAll('[data-aixc]').length,
			tags: document.querySelectorAll('[data-aixc-item], [data-aixc-section]').length,
			coverage: w.__aixc?.coverage?.ratio ?? null,
			destinations: (w.__aixc?.model?.sections ?? []).filter((x) => x.destinationId).length,
			pageMap: w.__aixc?.pageMap ?? null,
			reads: w.__aixc?.reads ?? null,
			mainHidden: document.getElementById('main-content')?.hidden ?? null,
		}
	})

/** Where Vodafone's own page sits: the header, #main-content and its sections, the footer. */
export const geometry = (page: Page) =>
	page.evaluate(() => {
		const r = (n: Element | null) => {
			if (!n) return null
			const b = n.getBoundingClientRect()
			return [b.top + scrollY, b.left, b.width, b.height].map(Math.round)
		}
		const main = document.getElementById('main-content')
		return { header: r(document.getElementById('header')), main: r(main), sections: [...(main?.children ?? [])].map(r), footer: r(document.querySelector('footer')), width: document.documentElement.scrollWidth }
	})

/** The box of Vodafone's furniture, and what a person would hit at its centre. */
export const furniture = (page: Page) =>
	page.evaluate(() => {
		const box = (el: Element | null) => {
			if (!el) return null
			const r = el.getBoundingClientRect()
			const visible = getComputedStyle(el).display !== 'none' && r.width > 0 && r.height > 0
			const top = visible ? document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) : null
			return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), visible, onTop: !!top && (top === el || el.contains(top)) }
		}
		return { button: box(document.getElementById('vodafone-aw-icon')), banner: box(document.getElementById('onetrust-banner-sdk')), filter: box(document.querySelector('.onetrust-pc-dark-filter')) }
	})

const ONLY_CMS = `if (window.top !== window || !/^\\/(en|ar)\\//.test(location.pathname)) return`
const WHEN_READY = (fn: string) => `if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ${fn}, { once: true }); else ${fn}()`

/** Vodafone's accessibility widget, in the shape the rendered page has (see the file comment). */
export const WIDGET_STAND_IN = `(() => {
	${ONLY_CMS}
	const add = () => {
		if (document.getElementById('vodafone-aw-icon')) return
		const css = document.createElement('style')
		css.setAttribute('data-stand-in', 'accessibility-widget')
		css.textContent = 'accessibility-widget[data-stand-in]{display:block;position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;--vf-fab-right:20px;--vf-fab-bottom:20px;--vf-fab-size:55px}' +
			'.vf-aw-fab[data-stand-in]{position:fixed;right:var(--vf-fab-right);bottom:var(--vf-fab-bottom);width:var(--vf-fab-size);height:var(--vf-fab-size);box-sizing:border-box;border-radius:50%;border:5px solid #fff;background:#e60000;box-shadow:0 6px 20px rgba(230,0,0,.35);z-index:var(--vf-z-fab,1);padding:0;cursor:pointer;transition:all .25s cubic-bezier(.4,0,.2,1)}'
		document.head.appendChild(css)
		const host = document.createElement('accessibility-widget')
		host.setAttribute('data-stand-in', '')
		const b = document.createElement('button')
		b.id = 'vodafone-aw-icon'
		b.type = 'button'
		b.className = 'vf-aw-fab'
		b.setAttribute('data-stand-in', '')
		b.setAttribute('aria-label', 'Accessibility (stand-in)')
		b.addEventListener('click', () => (window.__awClicks = (window.__awClicks || 0) + 1))
		host.appendChild(b)
		document.body.appendChild(host)
	}
	${WHEN_READY('add')}
})()`

/** OneTrust's first-visit banner and its full-page filter, at the measured places. */
export const BANNER_STAND_IN = `(() => {
	${ONLY_CMS}
	const add = () => {
		if (document.getElementById('onetrust-consent-sdk')) return
		const rtl = document.documentElement.dir === 'rtl' || (document.documentElement.lang || '').startsWith('ar')
		const sdk = document.createElement('div')
		sdk.id = 'onetrust-consent-sdk'
		sdk.setAttribute('data-stand-in', 'onetrust')
		const filter = document.createElement('div')
		filter.className = 'onetrust-pc-dark-filter ot-fade-in'
		filter.style.cssText = 'position:fixed;inset:0;z-index:2147483645;background:rgba(0,0,0,.5)'
		const banner = document.createElement('div')
		banner.id = 'onetrust-banner-sdk'
		banner.className = 'otFloatingRoundedCorner otRelFont ot-bottom-left'
		banner.setAttribute('tabindex', '0')
		if (rtl) banner.setAttribute('dir', 'rtl')
		const phone = innerWidth < 640
		banner.style.cssText = 'position:fixed;z-index:2147483645;background:#fff;box-sizing:border-box;padding:16px;bottom:1rem;height:' + (rtl ? 360 : 321) + 'px;' + (phone ? 'left:1rem;right:1rem' : rtl ? 'right:1rem;width:375px' : 'left:1rem;width:375px')
		banner.innerHTML = '<p>We use cookies.</p><button id="onetrust-accept-btn-handler" type="button">Accept All Cookies</button> <button id="onetrust-reject-all-handler" type="button">Reject All</button>'
		const answer = () => {
			banner.style.display = 'none'
			filter.style.display = 'none'
			document.cookie = 'OptanonAlertBoxClosed=' + new Date().toISOString() + '; path=/'
		}
		banner.querySelectorAll('button').forEach((x) => x.addEventListener('click', answer))
		sdk.append(filter, banner)
		document.body.appendChild(sdk)
	}
	${WHEN_READY('add')}
})()`

/** The signed-out theme's Guest Case: maintheme and static-theme clear localStorage on every load (O23). */
export const THEME_CLEAR_STAND_IN = `(() => {
	${ONLY_CMS}
	const run = () => {
		if (!document.querySelector('script[src*="/maintheme/js/scripts.js"], script[src*="/static-theme/js/scripts.js"]')) return
		if (location.href.toLowerCase().includes('type=portal')) return
		const lang = (document.documentElement.lang || '').startsWith('ar') ? 'ar' : 'en'
		localStorage.clear()
		localStorage.setItem('isLogedIn', 'false')
		localStorage.setItem('language', lang)
		window.__themeCleared = (window.__themeCleared || 0) + 1
	}
	// The theme's scripts.js is injected async from the page's own DOMContentLoaded listener.
	${WHEN_READY('() => setTimeout(run, 30)')}
})()`

/** Owl Carousel's layout (not its motion) of the carousels in #main-content. */
export const OWL_STAND_IN = `(() => {
	${ONLY_CMS}
	const layout = () => {
		const rtl = document.documentElement.dir === 'rtl'
		for (const c of document.querySelectorAll('#main-content .owl-carousel:not(.owl-loaded)')) {
			const kids = [...c.children]
			if (!kids.length) continue
			const pick = innerWidth < 768 ? c.getAttribute('items-sm') || '1' : innerWidth < 992 ? c.getAttribute('items-md') || c.getAttribute('items') : c.getAttribute('items')
			const items = Math.max(1, Math.min(kids.length, Number(pick) || 1))
			const margin = Number(c.getAttribute('margin') || 0)
			const loop = c.getAttribute('loop') === 'true' && kids.length > items
			c.classList.add('owl-loaded', 'owl-drag')
			c.style.display = 'block'
			const width = c.getBoundingClientRect().width
			const iw = Math.max(1, width / items - margin)
			const wrap = (el, cloned) => {
				const it = document.createElement('div')
				it.className = 'owl-item' + (cloned ? ' cloned' : '')
				it.style.cssText = 'flex:none;position:relative;min-height:1px;width:' + iw + 'px;' + (rtl ? 'margin-left:' : 'margin-right:') + margin + 'px'
				it.append(el)
				return it
			}
			const real = kids.map((k, i) => {
				const it = wrap(k, false)
				if (i < items) it.classList.add('active')
				return it
			})
			const before = loop ? kids.slice(-items).map((k) => wrap(k.cloneNode(true), true)) : []
			const after = loop ? kids.slice(0, items).map((k) => wrap(k.cloneNode(true), true)) : []
			const outer = document.createElement('div')
			outer.className = 'owl-stage-outer'
			outer.style.cssText = 'position:relative;overflow:hidden'
			const stage = document.createElement('div')
			stage.className = 'owl-stage'
			const all = [...before, ...real, ...after]
			stage.style.cssText = 'display:flex;width:' + all.length * (iw + margin) + 'px;transform:translate3d(' + (rtl ? 1 : -1) * before.length * (iw + margin) + 'px,0,0)'
			stage.append(...all)
			outer.append(stage)
			c.append(outer)
		}
	}
	${WHEN_READY('layout')}
})()`

/** Vodafone's navigation as it is once the page scrolls: pinned at the top, above the content (z-index 20). */
export const FIXED_HEADER_STAND_IN = `(() => {
	${ONLY_CMS}
	const pin = () => {
		const nav = document.querySelector('.nav-header')
		if (!nav) return
		const css = document.createElement('style')
		css.setAttribute('data-stand-in', 'nav-fixed')
		css.textContent = '.nav-header.nav-fixed{position:fixed;top:0;left:0;right:0;z-index:20;background:#fff}'
		document.head.appendChild(css)
		nav.classList.add('nav-fixed')
	}
	${WHEN_READY('pin')}
})()`

/* ------------------------------------------------ the page turn's stand-ins (W2-A, 2026-11-17) */

/**
 * Vodafone's navigation as its own script pins it: in the flow at the top of the page, and
 * `.nav-header.nav-fixed` (fixed at the top, z-index 20, the theme's rule) from the first scroll event
 * that finds the page scrolled, until one finds it at the top again.
 */
export const FIXED_HEADER_SCROLL_STAND_IN = `(() => {
	${ONLY_CMS}
	const start = () => {
		const nav = document.querySelector('.nav-header')
		if (!nav) return
		const css = document.createElement('style')
		css.setAttribute('data-stand-in', 'nav-fixed-scroll')
		css.textContent = '.nav-header.nav-fixed{position:fixed;top:0;left:0;right:0;z-index:20;background:#fff}'
		document.head.appendChild(css)
		const pin = () => {
			if (nav.classList.contains('nav-fixed') !== scrollY > 0) nav.classList.toggle('nav-fixed')
		}
		addEventListener('scroll', pin, { passive: true })
		pin()
	}
	${WHEN_READY('start')}
})()`

/**
 * Vodafone's phone menu as its own script opens it (the saved pages run no scripts; phase 4c, S7): a press on the
 * burger (.js-burger-toggle) toggles `.nav-opened` on the navigation (.nav-header), as reimagine-live's menu cases
 * set it. The wide screen's dropdowns need nothing: they open on hover by the theme's own CSS.
 *
 * While the phone menu is open the page does not scroll, as live: the walk of 2026-11-22 (live-verify floating2,
 * S7's menu cell at 375×812 on /en/services and /en/home) saw the page's classic scrollbar go with the menu open (the
 * layout viewport 360 -> 375 px, the open menu's list reaching 375), so Vodafone's fixed accessibility button
 * (right: 20px) moved 285 -> 300. Vodafone's navToggling() is not saved; the stand-in locks the page with the
 * theme's own utility, `.overflow-hidden{overflow:hidden!important}` (static-theme and maintheme styles.css), on
 * html and body (html,body carry the theme's overflow-x: hidden, so html's overflow is the viewport's). The lock
 * follows `.nav-opened` on the navigation, whoever sets or clears it.
 */
export const NAV_STAND_IN = `(() => {
	${ONLY_CMS}
	document.addEventListener('click', (event) => {
		const burger = event.target instanceof Element ? event.target.closest('.js-burger-toggle') : null
		if (!burger) return
		const nav = burger.closest('.nav-header') || document.querySelector('.nav-header')
		if (nav) nav.classList.toggle('nav-opened')
	})
	const start = () => {
		const sync = () => {
			const open = !!document.querySelector('.nav-header.nav-opened')
			for (const n of [document.documentElement, document.body]) if (n && n.classList.contains('overflow-hidden') !== open) n.classList.toggle('overflow-hidden', open)
		}
		new MutationObserver(sync).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] })
		sync()
	}
	${WHEN_READY('start')}
})()`

/**
 * Owl Carousel 2's AutoRefresh plugin, on the carousels the Owl stand-in laid out (Vodafone's own, never a
 * copy of them): every 500 ms, a carousel that is not visible by jQuery's rule (offsetWidth, offsetHeight or
 * a client rect) gets `.owl-hidden` (Owl's CSS: opacity 0), and loses it only on a poll that finds it visible
 * again. Only a change is written.
 */
export const OWL_AUTO_REFRESH_STAND_IN = `(() => {
	${ONLY_CMS}
	const start = () => {
		const css = document.createElement('style')
		css.setAttribute('data-stand-in', 'owl-auto-refresh')
		css.textContent = '.owl-carousel.owl-hidden{opacity:0}'
		document.head.appendChild(css)
		const visible = (c) => !!(c.offsetWidth || c.offsetHeight || c.getClientRects().length)
		setInterval(() => {
			for (const c of document.querySelectorAll('#main-content .owl-carousel.owl-loaded')) if (c.classList.contains('owl-hidden') === visible(c)) c.classList.toggle('owl-hidden')
		}, 500)
	}
	${WHEN_READY('start')}
})()`
