/**
 * npm run eval:router -- [--decider local|jev|laya] [--cases tests/fixtures/utterances.yaml]
 *                        [--manifest tests/fixtures/demo-telco.manifest.json | --site demo-telco]
 *                        [--accept 0.55 --clarify 0.3]
 *
 * Scores the router on an utterance set. With --site it reads the active KB
 * from the store; otherwise the frozen fixture manifest. Jev and Laya use the
 * same environment variables as the router service (JEV_API_KEY, LAYA_BASE_URL).
 */
import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'

import YAML from 'yaml'

import { CircuitBreaker, type Decider, SystemOneDecider } from '#services/router/deciders.ts'
import { type EvalCase, evaluate } from '#services/router/eval.ts'
import { loadPlatformConfig, ROOT } from '#shared/config.ts'
import { buildKbIndex } from '#shared/kb-index.ts'
import { openStore } from '#shared/store/index.ts'

const { values } = parseArgs({
	options: {
		decider: { type: 'string', default: 'local' },
		cases: { type: 'string', default: 'tests/fixtures/utterances.yaml' },
		manifest: { type: 'string', default: 'tests/fixtures/demo-telco.manifest.json' },
		site: { type: 'string' },
		accept: { type: 'string', default: '0.55' },
		clarify: { type: 'string', default: '0.3' },
		json: { type: 'boolean', default: false },
	},
})

const platform = loadPlatformConfig()
let manifest
if (values.site) {
	const store = await openStore(platform)
	manifest = await store.getActiveKb(values.site)
	await store.close()
	if (!manifest) throw new Error(`no active KB for ${values.site}`)
} else {
	manifest = JSON.parse(fs.readFileSync(path.resolve(ROOT, values.manifest!), 'utf8'))
}
const kb = buildKbIndex(manifest)
const cases = YAML.parse(fs.readFileSync(path.resolve(ROOT, values.cases!), 'utf8')) as EvalCase[]

let decider: Decider | undefined
if (values.decider === 'jev') {
	if (!platform.jev.apiKey) throw new Error('JEV_API_KEY is not set')
	decider = new SystemOneDecider({ name: 'jev', baseUrl: platform.jev.baseUrl, apiKey: platform.jev.apiKey, model: platform.jev.model, timeoutMs: platform.jev.timeoutMs })
} else if (values.decider === 'laya') {
	if (!platform.laya.baseUrl) throw new Error('LAYA_BASE_URL is not set')
	decider = new SystemOneDecider({ name: 'laya', baseUrl: platform.laya.baseUrl, apiKey: platform.laya.apiKey, timeoutMs: platform.laya.timeoutMs })
}

const s = await evaluate(cases, kb, { acceptAt: Number(values.accept), clarifyAt: Number(values.clarify), topK: 8, agentEnabled: true }, decider, decider ? new CircuitBreaker(1000) : undefined)
if (values.json) {
	console.log(JSON.stringify(s, null, 1))
} else {
	for (const r of s.rows) {
		const mark = r.ok ? 'ok  ' : 'FAIL'
		console.log(`${mark} ${r.case.say.padEnd(44)} -> ${r.got.route} ${r.got.dest || '-'} (${r.got.intent}, ${r.got.confidence}, ${r.got.provider}, ${r.got.ms} ms)${r.ok ? '' : '  ' + r.failures.join('; ')}`)
	}
	console.log(`\n${s.passed}/${s.total} passed (${(s.accuracy * 100).toFixed(1)}%), KB ${kb.versionId}, decider ${values.decider}`)
	for (const [f, v] of Object.entries(s.byField)) console.log(`  ${f.padEnd(7)} ${v.correct}/${v.checked}`)
	for (const [l, v] of Object.entries(s.byLang)) console.log(`  ${l.padEnd(7)} ${v.passed}/${v.total}`)
	console.log(`  latency p50 ${s.latency.p50} ms, p95 ${s.latency.p95} ms, max ${s.latency.max} ms; providers ${JSON.stringify(s.providers)}`)
}
process.exitCode = s.passed === s.total ? 0 : 1
