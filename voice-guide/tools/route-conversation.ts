/**
 * Routes a conversation through the real router on the committed knowledge base, turn by turn,
 * keeping the session between turns: what each request routes to, and the plan's steps.
 *
 *   node tools/route-conversation.ts "ايه اخر العروض" "العروض" "اشتري عرض ال ٤٠٠ ميجا"
 *   START=https://web.vodafone.com.eg/ar/home CANDS=1 node tools/route-conversation.ts "..."
 *
 * Uses VG_LLM_* from the environment like the gateway: unset means no agent routing (ADR-0034).
 */
import fs from 'node:fs'
import path from 'node:path'
import { createRouter } from '#services/router/handlers.ts'
import { loadPlatformConfig, loadSiteConfig, ROOT } from '#shared/config.ts'
import { buildKbIndex } from '#shared/kb-index.ts'

const site = loadSiteConfig(path.join(ROOT, 'config/sites/vodafone-eg.yaml'))
const kb = buildKbIndex(JSON.parse(fs.readFileSync(path.join(ROOT, 'config/kb/vodafone-eg.manifest.json'), 'utf8')))
const platform = loadPlatformConfig(process.env)
const router = createRouter({ platform, sites: new Map([[site.id, site]]), kb: { get: async () => kb } as any, tracer: { event: async () => {} } as any })
const session: any = { id: 's', siteId: site.id, lang: 'ar', createdAt: '', updatedAt: '', turns: [], usage: { agentSteps: 0, agentTokens: 0 } }
let url = process.env.START || 'https://web.vodafone.com.eg/ar/home'
for (const utt of process.argv.slice(2)) {
	const r = await router.turn({ siteId: site.id, session, utterance: utt, page: { url } }, { trace: {} } as any)
	const u = r.understanding
	console.log('\n>>', utt, '|', kb.pageFor(url)?.pageId)
	console.log('  ', u.lang, u.intent, u.flowId || '', 'route', u.route, 'conf', u.decision.confidence.toFixed(2), u.decision.provider, u.decision.destinationId)
	for (const c of u.candidates.slice(0, process.env.CANDS ? 5 : 0)) console.log('   cand', c.id, c.kind, c.score.toFixed(3), c.absolute.toFixed(2), c.label)
	console.log('   say', r.plan.say, JSON.stringify(r.plan.steps.map((s: any) => (s.op === 'ask' ? s.question : s.op === 'navigate' ? `navigate ${decodeURI(s.url)}` : s.op === 'spotlight' ? `spotlight ${s.target.css[0].slice(-60)}${s.read ? ' +read' : ''}` : s.op === 'say' ? `say ${s.text}` : s.op))))
	if (r.last) session.last = r.last
	session.turns.push(r.turn)
	const nav = r.plan.steps.find((s: any) => s.op === 'navigate') as any
	if (nav) url = nav.url
}
