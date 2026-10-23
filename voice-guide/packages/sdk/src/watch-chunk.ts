/**
 * Page watch from the guide (ADR-0023), loaded only when the person accepts a watch offer (size
 * budget, T-504): Web Push where the browser can subscribe, live delivery otherwise; and the
 * toast that shows a change.
 * Defines window.__vgWatch.
 */

export interface WatchContext {
	post<T = any>(path: string, body: unknown): Promise<T>
	sessionId: string
	push?: { publicKey: string } | null
	lang: string
}

export async function createWatch(c: WatchContext, step: { url: string; pageId?: string; target: unknown; label: string }, turnId: string): Promise<boolean> {
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

;(window as any).__vgWatch = { createWatch, toast }
