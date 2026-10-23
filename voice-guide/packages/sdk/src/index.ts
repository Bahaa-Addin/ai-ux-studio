/**
 * Loader: the one script tag a site adds (ADR-0006, ADR-0022).
 *   <script src="https://guide.example.com/sdk/guide.js" data-site-key="pk_..." async></script>
 * Optional: data-xray="open|button|off", data-open="true", data-gateway="<url>", data-events="poll".
 */
import { Guide } from './guide.ts'

function boot(): void {
	const w = window as any
	if (w.__vgBooted) return
	w.__vgBooted = true
	const script = (document.currentScript as HTMLScriptElement | null) || document.querySelector<HTMLScriptElement>('script[data-site-key][src*="/sdk/guide.js"]')
	if (!script) return console.warn('[voice-guide] script tag not found')
	const siteKey = script.dataset.siteKey
	if (!siteKey) return console.warn('[voice-guide] data-site-key is missing')
	// The gateway is wherever guide.js came from, keeping any path prefix: a demo browser can serve it
	// from the page's own origin (https://web.vodafone.com.eg/__vg/sdk/guide.js -> .../__vg) and
	// forward to a local gateway (ADR-0031). data-gateway overrides.
	const src = new URL(script.src)
	const gateway = script.dataset.gateway || `${src.origin}${src.pathname.replace(/\/sdk\/guide\.js$/, '')}`
	const events = script.dataset.events === 'poll' ? 'poll' : 'auto'
	const guide = new Guide({ gateway, siteKey, xray: script.dataset.xray as any, autoOpen: script.dataset.open === 'true', events })
	const start = () => guide.start().catch((e) => console.warn('[voice-guide] failed to start', e))
	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true })
	else void start()
}

boot()
