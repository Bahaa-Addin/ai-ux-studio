/**
 * Replay data is untrusted (ADR-0037 §5). Before the replayer sees a step's events this removes
 * everything that could run, navigate, submit or call out: scripts, frames, objects, `base`,
 * refresh and policy `meta`, inline handlers, `javascript:` and other active URLs, link targets,
 * form actions; it drops input, canvas, font, media, log, selection and plugin events; and it
 * sends every resource URL through the replay resource policy (same origin, no query, a static
 * asset; replaced by a `blob:` copy fetched without credentials, or by nothing). Pure: unit-tested
 * in Node against adversarial events, and again in Chromium.
 */
import { TRAIL_CONFIG } from './config.ts'
import { isEvent, type RawEvent } from './types.ts'

/** rrweb event types and incremental sources (stable across rrweb 2.x). */
const EV = { FullSnapshot: 2, Incremental: 3, Meta: 4, Custom: 5, Plugin: 6 }
const SRC = { Mutation: 0, Input: 5, MediaInteraction: 7, StyleSheetRule: 8, CanvasMutation: 9, Font: 10, Log: 11, StyleDeclaration: 13, Selection: 14, AdoptedStyleSheet: 15 }
const DROP_SOURCES = new Set([SRC.Input, SRC.MediaInteraction, SRC.CanvasMutation, SRC.Font, SRC.Log, SRC.Selection])
const NODE = { Document: 0, DocumentType: 1, Element: 2, Text: 3, CDATA: 4, Comment: 5 }

/** Elements that are removed with their content. */
const DROP_TAGS = new Set(['script', 'noscript', 'base', 'template', 'portal', 'applet', 'foreignobject', 'animate', 'set', 'animatemotion', 'animatetransform', 'discard', 'handler', 'listener'])
/** Elements that would load or run something: kept as an empty box of the same size. Every empty box draws nothing in the replay (`data-vg-blocked`). */
const BOX_TAGS = new Set(['iframe', 'frame', 'frameset', 'object', 'embed', 'video', 'audio', 'canvas', 'source', 'track', 'dialog'])
/** Attributes that carry a URL that is loaded (resources) or followed (navigation). */
const RESOURCE_ATTRS = new Set(['src', 'srcset', 'imagesrcset', 'poster', 'background', 'lowsrc', 'dynsrc', 'href', 'xlink:href'])
const NAV_ATTRS = new Set(['action', 'formaction', 'ping', 'target', 'formtarget', 'download', 'cite', 'longdesc', 'manifest', 'codebase', 'data', 'archive', 'classid', 'usemap', 'itemtype', 'profile', 'srcdoc', 'sandbox', 'allow', 'http-equiv', 'integrity', 'nonce', 'autofocus', 'popover', 'popovertarget', 'popovertargetaction', 'contenteditable'])
const ACTIVE_URL = /^\s*(javascript|vbscript|livescript|data:text\/html|data:application|data:image\/svg|blob|file|about|filesystem|chrome|intent|mailto|tel|sms)/i
const SAFE_DATA_IMAGE = /^data:image\/(png|gif|jpeg|webp|avif);base64,[a-z0-9+/=\s]+$/i
const TRANSPARENT = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

export interface ResourceRules {
	/** The page's own origin: the only one resources may come from. */
	origin: string
	/** Same-origin folders (`/documents/`) whose files are allowed even with a query or no extension. */
	assetPaths?: readonly string[]
	/** URL to its credential-free copy (a `blob:` URL), once fetched. */
	resolved?: Map<string, string>
	/** Called with every URL the policy allows, to fetch it. */
	collect?: (url: string) => void
}

/** Same origin, no query, no credentials, a static asset by extension. */
export function allowedResource(url: string, origin: string, assetPaths: readonly string[] = []): boolean {
	let u: URL
	try {
		u = new URL(url)
	} catch {
		return false
	}
	if (u.origin !== origin || u.username || u.password || !/^https?:$/.test(u.protocol)) return false
	// A site's declared asset folder: its files carry ids and cache-busting queries instead of extensions.
	if (assetPaths.some((p) => u.pathname.startsWith(p) && !u.pathname.includes('..'))) return true
	if (u.search) return false
	const ext = /\.([a-z0-9]+)$/i.exec(u.pathname)?.[1]?.toLowerCase()
	return !!ext && (TRAIL_CONFIG.replay.staticExtensions as readonly string[]).includes(ext)
}

function rewriteUrl(raw: string, r: ResourceRules, image: boolean): string {
	const url = raw.trim()
	if (!url) return ''
	if (SAFE_DATA_IMAGE.test(url)) return url
	if (url.startsWith('#')) return url
	if (ACTIVE_URL.test(url)) return image ? TRANSPARENT : ''
	const clean = url.replace(/#.*$/, '')
	if (!allowedResource(clean, r.origin, r.assetPaths)) return image ? TRANSPARENT : ''
	r.collect?.(clean)
	return r.resolved?.get(clean) ?? (image ? TRANSPARENT : '')
}

/** CSS text: `@import` removed, every `url(...)` through the policy, legacy script hooks removed. */
export function sanitizeCss(css: string, r: ResourceRules): string {
	return css
		.replace(/@import[^;]*;?/gi, '')
		.replace(/expression\s*\(|-moz-binding\s*:|behavior\s*:/gi, 'x:')
		.replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi, (_m, _q, u: string) => {
			const out = rewriteUrl(u, r, true)
			return out ? `url("${out}")` : 'none'
		})
}

function srcset(v: string, r: ResourceRules): string {
	return v
		.split(',')
		.map((part) => {
			const [u, ...d] = part.trim().split(/\s+/)
			const out = rewriteUrl(u || '', r, false)
			return out ? [out, ...d].join(' ') : ''
		})
		.filter(Boolean)
		.join(', ')
}

type Attrs = Record<string, unknown>

/** One element's attributes, in place. */
function sanitizeAttributes(tag: string, attrs: Attrs, r: ResourceRules): void {
	for (const name of Object.keys(attrs)) {
		const n = name.toLowerCase()
		const v = attrs[name]
		if (n.startsWith('on') || NAV_ATTRS.has(n)) {
			delete attrs[name]
			continue
		}
		if (n === 'style' && typeof v === 'string') attrs[name] = sanitizeCss(v, r)
		else if (n === '_csstext' && typeof v === 'string') attrs[name] = sanitizeCss(v, r)
		else if (n === 'srcset' || n === 'imagesrcset') attrs[name] = typeof v === 'string' ? srcset(v, r) : ''
		else if (RESOURCE_ATTRS.has(n)) {
			if (typeof v !== 'string') continue
			// Links are never followed in a memory: no href on a, area; SVG <use> only within the document.
			if (n === 'href' || n === 'xlink:href') {
				if (tag === 'a' || tag === 'area') delete attrs[name]
				else if (tag === 'use' && !v.startsWith('#')) delete attrs[name]
				else if (tag === 'link') {
					if (attrs._cssText !== undefined) delete attrs[name]
					else attrs[name] = rewriteUrl(v, r, false)
				} else attrs[name] = rewriteUrl(v, r, tag === 'image')
			} else attrs[name] = rewriteUrl(v, r, tag === 'img' || tag === 'input' || tag === 'image')
		} else if (typeof v === 'string' && ACTIVE_URL.test(v) && /^(javascript|vbscript|livescript)/i.test(v.trim())) delete attrs[name]
	}
	if (tag === 'meta' && attrs['http-equiv'] !== undefined) delete attrs['http-equiv']
	if (tag === 'meta' && typeof attrs.content === 'string' && /url\s*=/i.test(attrs.content)) delete attrs.content
}

type SNode = { type: number; tagName?: string; attributes?: Attrs; childNodes?: SNode[]; textContent?: string; isStyle?: boolean; id?: number; [k: string]: unknown }

/** A serialized node tree, in place; returns false when the node itself must go. */
function sanitizeNode(n: SNode, r: ResourceRules, parentTag = ''): boolean {
	if (!n || typeof n !== 'object' || typeof n.type !== 'number') return false
	if (n.type === NODE.Comment) return false
	if (n.type === NODE.Text || n.type === NODE.CDATA) {
		if (typeof n.textContent === 'string' && (n.isStyle || parentTag === 'style')) n.textContent = sanitizeCss(n.textContent, r)
		return true
	}
	if (n.type === NODE.Element) {
		const tag = String(n.tagName || '').toLowerCase()
		if (!tag || DROP_TAGS.has(tag)) return false
		const attrs = (n.attributes && typeof n.attributes === 'object' ? n.attributes : {}) as Attrs
		if (tag === 'meta' && attrs['http-equiv'] !== undefined) return false
		if (tag === 'link' && /preload|prefetch|preconnect|dns-prefetch|modulepreload|manifest|import|prerender|icon/i.test(String(attrs.rel || ''))) return false
		if (BOX_TAGS.has(tag)) {
			const keep: Attrs = {}
			for (const k of ['class', 'style', 'rr_width', 'rr_height', 'width', 'height']) if (attrs[k] !== undefined) keep[k] = attrs[k]
			n.tagName = 'div'
			n.attributes = { ...keep, 'data-vg-blocked': '' }
			if (typeof keep.style === 'string') n.attributes.style = sanitizeCss(keep.style, r)
			n.childNodes = []
			return true
		}
		sanitizeAttributes(tag, attrs, r)
		// Blocked by the recorder: rrweb kept only its class and size, so the rules that placed and drew it no longer
		// match and the browser's own look would show (Vodafone's accessibility button, a grey square at the top; F12).
		if (attrs.rr_width !== undefined) attrs['data-vg-blocked'] = ''
		n.attributes = attrs
	}
	if (Array.isArray(n.childNodes)) n.childNodes = n.childNodes.filter((c) => sanitizeNode(c, r, String(n.tagName || '').toLowerCase()))
	return true
}

/** A mutation's attribute change: same rules as a full snapshot. Style objects come property by property. */
function sanitizeAttrChange(a: { id?: number; attributes?: Attrs }, tagOf: (id: number) => string, r: ResourceRules): void {
	const attrs = a.attributes
	if (!attrs || typeof attrs !== 'object') return
	const tag = typeof a.id === 'number' ? tagOf(a.id) : ''
	for (const [k, v] of Object.entries(attrs)) {
		if (k === 'style' && v && typeof v === 'object') {
			for (const [p, pv] of Object.entries(v as Record<string, unknown>)) {
				if (typeof pv === 'string') (v as Record<string, unknown>)[p] = sanitizeCss(pv, r)
				else if (Array.isArray(pv) && typeof pv[0] === 'string') pv[0] = sanitizeCss(pv[0], r)
			}
			continue
		}
		if (v === null) continue
		const one: Attrs = { [k]: v }
		sanitizeAttributes(tag, one, r)
		if (k in one) attrs[k] = one[k]
		else delete attrs[k]
	}
}

export interface Sanitized {
	events: RawEvent[]
	dropped: number
}

/**
 * Returns a sanitized copy of one step's events: sorted, malformed events dropped, at most
 * `maxEvents`, and only if it starts from a full snapshot (otherwise there is nothing to show).
 */
export function sanitizeEvents(input: unknown[], r: ResourceRules): Sanitized {
	let dropped = 0
	const tags = new Map<number, string>()
	const remember = (n: SNode) => {
		if (n?.type === NODE.Element && typeof n.id === 'number') tags.set(n.id, String(n.tagName || '').toLowerCase())
		for (const c of n?.childNodes || []) remember(c)
	}
	const out: RawEvent[] = []
	const list = input.filter((e): e is RawEvent => {
		if (isEvent(e)) return true
		dropped++
		return false
	})
	list.sort((a, b) => a.timestamp - b.timestamp)
	for (const raw of list.slice(0, TRAIL_CONFIG.replay.maxEvents)) {
		let e: RawEvent
		try {
			e = structuredClone(raw)
		} catch {
			dropped++
			continue
		}
		const d = e.data as Record<string, any> | undefined
		if (e.type === EV.Plugin || e.type === EV.Custom) {
			dropped++
			continue
		}
		if (e.type === EV.Meta) {
			// Where the page was, for the replayer's viewport only; never followed.
			if (d && typeof d.href === 'string') d.href = d.href.replace(/[?#].*$/, '')
			out.push(e)
			continue
		}
		if (e.type === EV.FullSnapshot) {
			if (!d?.node || !sanitizeNode(d.node, r)) {
				dropped++
				continue
			}
			tags.clear()
			remember(d.node)
			out.push(e)
			continue
		}
		if (e.type === EV.Incremental) {
			const src = d?.source
			if (typeof src !== 'number' || DROP_SOURCES.has(src)) {
				dropped++
				continue
			}
			if (src === SRC.Mutation) {
				d!.adds = (Array.isArray(d!.adds) ? d!.adds : []).filter((a: any) => {
					if (!a?.node || !sanitizeNode(a.node, r)) return false
					remember(a.node)
					return true
				})
				for (const a of Array.isArray(d!.attributes) ? d!.attributes : []) sanitizeAttrChange(a, (id) => tags.get(id) || '', r)
				for (const t of Array.isArray(d!.texts) ? d!.texts : []) if (typeof t?.value === 'string' && /url\(|@import/i.test(t.value)) t.value = sanitizeCss(t.value, r)
			} else if (src === SRC.StyleSheetRule) {
				for (const a of Array.isArray(d!.adds) ? d!.adds : []) if (typeof a?.rule === 'string') a.rule = sanitizeCss(a.rule, r)
				if (Array.isArray(d!.replace)) d!.replace = ''
				if (typeof d!.replace === 'string') d!.replace = sanitizeCss(d!.replace, r)
				if (typeof d!.replaceSync === 'string') d!.replaceSync = sanitizeCss(d!.replaceSync, r)
			} else if (src === SRC.StyleDeclaration) {
				if (d!.set && typeof d!.set.value === 'string') d!.set.value = sanitizeCss(d!.set.value, r)
			} else if (src === SRC.AdoptedStyleSheet) {
				for (const st of Array.isArray(d!.styles) ? d!.styles : []) for (const rule of Array.isArray(st?.rules) ? st.rules : []) if (typeof rule?.rule === 'string') rule.rule = sanitizeCss(rule.rule, r)
			}
			out.push(e)
			continue
		}
		// DomContentLoaded and Load carry nothing the replayer needs.
		if (e.type === 0 || e.type === 1) {
			out.push(e)
			continue
		}
		dropped++
	}
	const first = out.findIndex((e) => e.type === EV.FullSnapshot)
	if (first < 0) return { events: [], dropped: dropped + out.length }
	// The replayer needs a Meta (viewport) before the first full snapshot.
	const meta = out.slice(0, first).reverse().find((e) => e.type === EV.Meta)
	const events = [...(meta ? [meta] : [{ type: EV.Meta, timestamp: out[first].timestamp, data: { href: '', width: 1280, height: 800 } }]), ...out.slice(first)]
	return { events, dropped }
}

/** Every resource URL the policy would allow in these events (to fetch before the real pass). */
export function collectResources(events: unknown[], origin: string, assetPaths: readonly string[] = []): string[] {
	const found = new Set<string>()
	sanitizeEvents(events, { origin, assetPaths, collect: (u) => found.add(u) })
	return [...found]
}
