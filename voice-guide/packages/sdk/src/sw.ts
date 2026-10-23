/// <reference lib="webworker" />
/**
 * Push service worker (ADR-0023), served from the site's own origin at /vg-sw.js.
 * Shows watch notifications and opens the watched page when tapped.
 */
const sw = self as unknown as ServiceWorkerGlobalScope

sw.addEventListener('install', () => void sw.skipWaiting())
sw.addEventListener('activate', (e) => e.waitUntil(sw.clients.claim()))

sw.addEventListener('push', (e) => {
	let data: any = {}
	try {
		data = e.data?.json() ?? {}
	} catch {
		data = { title: e.data?.text() || 'Update' }
	}
	e.waitUntil(
		sw.registration.showNotification(data.title || 'Update', {
			body: data.body || '',
			lang: data.lang,
			dir: data.lang === 'ar' ? 'rtl' : 'ltr',
			tag: data.watchId || undefined,
			data: { url: data.url },
		}),
	)
})

sw.addEventListener('notificationclick', (e) => {
	e.notification.close()
	const url = (e.notification.data as any)?.url
	if (url) e.waitUntil(sw.clients.openWindow(url))
})
