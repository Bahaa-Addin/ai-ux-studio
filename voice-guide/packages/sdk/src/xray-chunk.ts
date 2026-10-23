/**
 * The X-ray drawer, loaded only when someone opens it (demo tool, ADR-0021; size budget T-504):
 * the event model, the renderer and the drawer's styles. Defines window.__vgXray.
 */
import type { XrayEls, XrayView } from './ui.ts'
import { XrayModel } from './xray.ts'
import { XRAY_CSS } from './xray-css.ts'


export function renderXray(els: XrayEls, view: XrayView): void {
	els.kb.textContent = view.kbVersion ? `KB ${view.kbVersion}` : ''
	const tot = view.totals
	els.totals.innerHTML = ''
	const cell = (k: string, v: string) => {
		const d = document.createElement('div')
		const em = document.createElement('em')
		em.textContent = k
		const s = document.createElement('strong')
		s.textContent = v
		d.append(em, s)
		els.totals.appendChild(d)
	}
	cell('requests', String(tot.turns))
	cell('no LLM', tot.turns ? `${Math.round((100 * tot.replayed) / tot.turns)}%` : '-')
	cell('1st motion p50', tot.firstMotionP50 !== null ? `${tot.firstMotionP50} ms` : '-')
	const list = els.turns
	list.innerHTML = ''
	for (const turn of [...view.turns].reverse()) {
		const box = document.createElement('div')
		box.className = 'turn'
		const u = document.createElement('div')
		u.className = 'u'
		u.dir = 'auto'
		if (turn.route) {
			const b = document.createElement('span')
			b.className = `badge ${turn.route}`
			b.textContent = turn.route
			u.appendChild(b)
		}
		u.append(turn.utterance || '…')
		box.appendChild(u)
		for (const ev of turn.events) {
			const row = document.createElement('div')
			row.className = 'ev'
			const layer = document.createElement('span')
			layer.className = `layer ${ev.kind}`
			layer.textContent = ev.layer
			const d = document.createElement('span')
			d.className = 'd'
			d.dir = 'auto'
			d.textContent = ev.detail
			const ms = document.createElement('span')
			ms.className = 'ms'
			ms.textContent = ev.ms !== undefined ? `${ev.ms} ms` : ''
			row.append(layer, d, ms)
			box.appendChild(row)
		}
		list.appendChild(box)
	}
}

;(window as any).__vgXray = { XrayModel, renderXray, XRAY_CSS }
