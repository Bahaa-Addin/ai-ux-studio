/**
 * Page watch from the guide (ADR-0023), loaded only when the person accepts a watch offer or a
 * watched section changes (size budget, T-504, ADR-0041): Web Push where the browser can
 * subscribe, live delivery otherwise; and the announcement and toast that show a change.
 * A watch is handed to the experience layer first where the page has it (ADR-0078: the watch lives
 * in the visitor's browser). Defines window.__vgWatch.
 */

export interface WatchContext {
	post<T = any>(path: string, body: unknown): Promise<T>
	sessionId: string
	push?: { publicKey: string } | null
	lang: string
}

interface LayerWatch {
	fromGuide(step: unknown): Promise<{ ok: boolean; reason?: string } | null | undefined>
}

/**
 * The experience layer's page watch (ADR-0078 point 7), when the page has it: window.__aixcWatch now, or
 * once it says 'aixc:watch-ready' within `ms` (the layer loads it at idle after a navigation). Else null.
 */
function layerWatch(ms: number): Promise<LayerWatch | null> {
	const now = () => ((window as any).__aixcWatch?.fromGuide ? ((window as any).__aixcWatch as LayerWatch) : null)
	if (now()) return Promise.resolve(now())
	return new Promise((resolve) => {
		const done = () => {
			clearTimeout(timer)
			window.removeEventListener('aixc:watch-ready', done)
			resolve(now())
		}
		const timer = setTimeout(done, ms)
		window.addEventListener('aixc:watch-ready', done)
	})
}

/**
 * The layer first (phase 6 design §4.6): it pockets the card the step names and watches it in the browser,
 * so true, and the guide says its `watching` line; its refusal (not a card) is false, so `watchFailed`. No
 * layer on the page (`/spa/`, `?aixc=off`): false at once on a browser-mode site (the session's site.watch.mode),
 * before any permission prompt; else the server path.
 */
export async function createWatch(c: WatchContext, step: { url: string; pageId?: string; target: unknown; label: string }, turnId: string, o: { layerWaitMs?: number } = {}): Promise<boolean> {
	const layer = await layerWatch(o.layerWaitMs ?? 3000)
	if (layer) return !!(await layer.fromGuide(step))?.ok
	// A browser-mode site (ADR-0078) has no server watch: never a permission prompt or a push subscription for one.
	if ((window as any).voiceGuide?.session?.site?.watch?.mode === 'browser') return false
	let subscriptionId: string | undefined
	try {
		subscriptionId = await pushSubscription(c)
	} catch (e) {
		console.info('[voice-guide] push unavailable, using live delivery', e)
	}
	if (!subscriptionId && 'Notification' in window && Notification.permission === 'default') await Notification.requestPermission().catch(() => 'denied')
	await c.post('/v1/watch', { sessionId: c.sessionId, turnId, subscriptionId, url: step.url, pageId: step.pageId, target: step.target, label: step.label, lang: c.lang })
	return true
}

async function pushSubscription(c: WatchContext): Promise<string | undefined> {
	if (!c.push || !('serviceWorker' in navigator) || !('PushManager' in window)) return undefined
	const perm = await Notification.requestPermission()
	if (perm !== 'granted') return undefined
	const reg = await navigator.serviceWorker.register('/vg-sw.js', { scope: '/' })
	await navigator.serviceWorker.ready
	const key = Uint8Array.from(atob(c.push.publicKey.replace(/-/g, '+').replace(/_/g, '/')), (ch) => ch.charCodeAt(0))
	// A browser that cannot reach its push service can stall here; fall back to live delivery.
	const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('push subscribe timed out')), 4000))
	const sub = (await reg.pushManager.getSubscription()) || (await Promise.race([reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }), timeout]))
	const r = await c.post<{ subscriptionId: string }>('/v1/push/subscribe', { sessionId: c.sessionId, subscription: sub.toJSON() })
	return r.subscriptionId
}

const TOAST_CSS = `
.toast { position: fixed; z-index: 2147483602; top: 20px; inset-inline-end: 20px; width: min(360px, calc(100vw - 40px)); background: #fff; border-inline-start: 5px solid var(--accent); border-radius: 12px; box-shadow: 0 10px 32px rgba(0,0,0,.25); padding: 12px 14px; display: none; }
.toast.on { display: block; animation: slide .3s ease; }
.toast b { display: block; margin-bottom: 4px; }
@keyframes slide { from { transform: translateY(-12px); opacity: 0; } }
`

let toastTimer = 0

/** Shows a page-watch notification in the guide's own shadow root. */
export function toast(root: ShadowRoot, el: HTMLElement, title: string, body: string): void {
	if (!root.querySelector('style[data-vg-toast]')) {
		const st = document.createElement('style')
		st.dataset.vgToast = ''
		st.textContent = TOAST_CSS
		root.insertBefore(st, root.firstChild)
	}
	el.innerHTML = ''
	const b = document.createElement('b')
	b.textContent = title
	const p = document.createElement('div')
	p.textContent = body
	el.append(b, p)
	el.dir = 'auto'
	el.classList.add('on')
	clearTimeout(toastTimer)
	toastTimer = window.setTimeout(() => el.classList.remove('on'), 9000)
}

/**
 * Announces one page-watch change from the guide's event stream (ADR-0023), once: the stream
 * replays its backlog on every page load. Toast, spoken line, and a system notification for live
 * watches (push watches are shown by the service worker). Lives here, not in guide.js (ADR-0041).
 */
export function notify(siteKey: string, root: ShadowRoot, el: HTMLElement, say: (text: string) => void, ev: { at: string; seq?: number; attrs: Record<string, any> }): void {
	const key = `vg:${siteKey}:notified`
	let seen = 0
	try {
		seen = JSON.parse(sessionStorage.getItem(key) || '0')
	} catch {}
	if ((ev.seq ?? 0) <= seen || Date.now() - Date.parse(ev.at) > 5 * 60_000) return
	try {
		sessionStorage.setItem(key, JSON.stringify(ev.seq ?? 0))
	} catch {}
	const a = ev.attrs
	toast(root, el, a.title, a.body)
	say(`${a.title}. ${a.body}`)
	if ('Notification' in window && Notification.permission === 'granted' && a.channel !== 'push') {
		try {
			new Notification(a.title, { body: a.body, lang: a.lang, dir: a.lang === 'ar' ? 'rtl' : 'ltr', tag: a.watchId })
		} catch {}
	}
}

;(window as any).__vgWatch = { createWatch, toast, notify }
