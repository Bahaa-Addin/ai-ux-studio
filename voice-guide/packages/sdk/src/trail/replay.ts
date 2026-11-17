/**
 * The preview of one step (ADR-0035, ADR-0037 §5): sanitized events in rrweb's sandboxed iframe
 * (`sandbox="allow-same-origin"`, no scripts, forms, popups, navigation or downloads), resources
 * replaced by credential-free `blob:` copies, a content security policy for anything later, no
 * pointer input, not focusable, hidden from assistive technology (the timeline's slider is the
 * accessible control). One preview at a time; `destroy()` releases everything it made.
 */
import { Replayer } from '@rrweb/replay'

import { TRAIL_CONFIG } from './config.ts'
import { collectResources, sanitizeEvents } from './sanitize.ts'

/** Anything the sanitizer missed still cannot load: only blob: and data: copies are allowed. */
export const REPLAY_CSP = "default-src 'none'; img-src blob: data:; style-src 'unsafe-inline' blob: data:; font-src blob: data:; media-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'"

export interface PreviewOptions {
	root: HTMLElement
	events: unknown[]
	/** The page's origin: the only one resources may come from. */
	origin: string
	/** Same-origin asset folders allowed despite a query or no extension (site setting `trail.replayAssetPaths`). */
	assetPaths?: string[]
	reducedMotion: boolean
	label: string
	onTime?(ms: number): void
	onFinish?(): void
}

export interface Preview {
	readonly duration: number
	readonly dropped: number
	seek(ms: number): void
	play(fromMs?: number): void
	pause(): void
	current(): number
	resize(): void
	destroy(): void
}

async function fetchResources(urls: string[]): Promise<Map<string, string>> {
	const map = new Map<string, string>()
	let budget = TRAIL_CONFIG.replay.maxResourceBytes
	await Promise.all(
		urls.slice(0, TRAIL_CONFIG.replay.maxResources).map(async (u) => {
			const ctl = new AbortController()
			const timer = setTimeout(() => ctl.abort(), TRAIL_CONFIG.replay.resourceTimeoutMs)
			try {
				// No cookies, no redirects, no referrer: the copy is fetched the way a stranger would see it.
				const res = await fetch(u, { credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer', cache: 'force-cache', signal: ctl.signal })
				if (!res.ok) return
				// Only what a page shows: an image, a font or a stylesheet, whatever the address looked like.
				if (!/^(image\/(png|gif|jpeg|webp|avif|svg\+xml|x-icon|vnd\.microsoft\.icon)|font\/|text\/css|application\/(font|x-font|vnd\.ms-fontobject))/i.test(res.headers.get('content-type') || '')) return
				const blob = await res.blob()
				if (blob.size > budget) return
				budget -= blob.size
				map.set(u, URL.createObjectURL(blob))
			} catch {
			} finally {
				clearTimeout(timer)
			}
		}),
	)
	return map
}

export async function createPreview(o: PreviewOptions): Promise<Preview> {
	const urls = collectResources(o.events, o.origin, o.assetPaths)
	const resources = await fetchResources(urls)
	const { events, dropped } = sanitizeEvents(o.events, { origin: o.origin, assetPaths: o.assetPaths, resolved: resources })
	if (events.length < 2) {
		for (const b of resources.values()) URL.revokeObjectURL(b)
		throw new Error('nothing to replay')
	}
	const stage = document.createElement('div')
	stage.className = 'tr-stage'
	o.root.replaceChildren(stage)
	const replayer = new Replayer(events as never, {
		root: stage,
		speed: 1,
		skipInactive: false,
		showWarning: false,
		showDebug: false,
		liveMode: false,
		triggerFocus: false,
		pauseAnimation: true,
		UNSAFE_replayCanvas: false,
		useVirtualDom: true,
		mouseTail: o.reducedMotion ? false : { duration: 700, lineCap: 'round', lineWidth: 3, strokeStyle: 'rgba(230, 0, 0, .55)' },
		// A blocked node keeps its place and size and draws nothing (sanitize.ts marks it).
		insertStyleRules: ['*, *::before, *::after { cursor: default !important; caret-color: transparent !important; }', 'html { pointer-events: none !important; user-select: none !important; }', '[data-vg-blocked] { visibility: hidden !important; }'],
		logger: { log() {}, warn() {} },
	})
	const iframe = replayer.iframe
	iframe.setAttribute('tabindex', '-1')
	iframe.setAttribute('aria-hidden', 'true')
	iframe.setAttribute('title', o.label)
	iframe.setAttribute('referrerpolicy', 'no-referrer')
	iframe.style.pointerEvents = 'none'
	// Every rebuilt document gets the policy before anything else can be added to it.
	const harden = () => {
		const doc = iframe.contentDocument
		const head = doc?.head || doc?.documentElement
		if (!doc || !head || head.querySelector('meta[data-vg-csp]')) return
		const meta = doc.createElement('meta')
		meta.setAttribute('http-equiv', 'Content-Security-Policy')
		meta.setAttribute('content', REPLAY_CSP)
		meta.setAttribute('data-vg-csp', '')
		head.insertBefore(meta, head.firstChild)
	}
	replayer.on('fullsnapshot-rebuilded', harden)
	const meta = replayer.getMetaData()
	let w = 1280
	let h = 800
	// The recorded viewport, scaled to fit the preview and centred in it (a phone recording is tall).
	const fit = () => {
		const box = o.root.getBoundingClientRect()
		const s = box.width > 0 ? Math.min(box.width / w, (box.height || box.width * (h / w)) / h) : 0.4
		stage.style.width = `${w}px`
		stage.style.height = `${h}px`
		stage.style.transform = `translate(${Math.max(0, (box.width - w * s) / 2)}px, ${Math.max(0, (box.height - h * s) / 2)}px) scale(${s})`
	}
	replayer.on('resize', (d: unknown) => {
		const x = d as { width?: number; height?: number }
		if (x?.width && x?.height) {
			w = x.width
			h = x.height
			fit()
		}
	})
	let raf = 0
	const follow = () => {
		o.onTime?.(replayer.getCurrentTime())
		raf = requestAnimationFrame(follow)
	}
	replayer.on('finish', () => {
		cancelAnimationFrame(raf)
		o.onFinish?.()
	})
	replayer.pause(0)
	harden()
	fit()
	let destroyed = false
	return {
		duration: Math.max(0, meta.totalTime),
		dropped,
		seek(ms) {
			if (destroyed) return
			cancelAnimationFrame(raf)
			replayer.pause(Math.max(0, Math.min(ms, meta.totalTime)))
			o.onTime?.(replayer.getCurrentTime())
		},
		play(fromMs) {
			if (destroyed) return
			replayer.play(Math.max(0, Math.min(fromMs ?? replayer.getCurrentTime(), meta.totalTime)))
			cancelAnimationFrame(raf)
			raf = requestAnimationFrame(follow)
		},
		pause() {
			if (destroyed) return
			cancelAnimationFrame(raf)
			replayer.pause()
		},
		current: () => (destroyed ? 0 : replayer.getCurrentTime()),
		resize: fit,
		destroy() {
			if (destroyed) return
			destroyed = true
			cancelAnimationFrame(raf)
			try {
				replayer.destroy()
			} catch {}
			stage.remove()
			for (const b of resources.values()) URL.revokeObjectURL(b)
			resources.clear()
		},
	}
}
