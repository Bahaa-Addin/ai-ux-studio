/**
 * The page context carries the commit floor on every page (ADR-0058): known to the knowledge base or
 * not, with no knowledge base at all, and on a commit page a ':root' mark that makes the guide's
 * own CommitGuard refuse every click there.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { COMMIT_SELECTORS } from '#kb'
import { createKnowledge } from '#services/knowledge/handlers.ts'

import { fixtureKb } from '../helpers/kb.ts'

const deps = (kb: ReturnType<typeof fixtureKb> | null) => ({ store: {} as never, sites: new Map(), kb: { get: async () => kb } as never })

test('the commit floor reaches every page; a commit page is marked whole', async () => {
	const k = createKnowledge(deps(fixtureKb()))
	const flat = (t: string[][]) => t.flat()
	const known = await k.pageContext({ siteId: 'demo-telco', url: 'http://localhost:4401/en/bundles.html' })
	for (const css of COMMIT_SELECTORS) assert.ok(flat(known.commitTargets).includes(css), `${css} on a known page`)
	assert.ok(!flat(known.commitTargets).includes(':root'), 'an ordinary page is not marked whole')
	const kbOwn = fixtureKb().manifest.destinations.filter((d) => d.commit && d.target).length
	assert.ok(known.commitTargets.length >= kbOwn + 1, 'the knowledge base\'s own commit points stay')
	const cart = await k.pageContext({ siteId: 'demo-telco', url: 'https://eshop.vodafone.com.eg/en/cart' })
	assert.ok(flat(cart.commitTargets).includes(':root'), 'the cart is a commit page')
	const none = await createKnowledge(deps(null)).pageContext({ siteId: 'x', url: 'https://eshop.vodafone.com.eg/ar/checkout/shipping' })
	assert.ok(flat(none.commitTargets).includes('#sl-add-to-cart-button') && flat(none.commitTargets).includes(':root'), 'without a knowledge base too')
})
