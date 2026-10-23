// Runs both TypeScript projects. Errors in our code fail the check. page-agent ships its
// TypeScript sources, so tsc checks them too; known upstream errors are listed here by exact
// file and code (ADR-0017) and reported, not failed. Any other upstream error fails, so an
// upgrade cannot slip a new one past us.
import { spawnSync } from 'node:child_process'

const KNOWN_UPSTREAM: { file: string; code: string; why: string }[] = [
	{
		file: 'node_modules/@page-agent/llms/src/utils.ts',
		code: 'TS2769',
		why: "asks zod for target 'openapi-3.0' (zod >= 4.1); zod 3.25 logs a warning and emits plain JSON Schema",
	},
]

const projects = ['tsconfig.json', 'packages/sdk/tsconfig.json']
// Match on the path's tail so symlinked or hoisted node_modules (reported as ../../x/node_modules/...) still match.
const isKnown = (line: string, k: (typeof KNOWN_UPSTREAM)[number]) => (line.startsWith(k.file) || line.includes(`/${k.file}(`)) && line.includes(`error ${k.code}`)
let failed = false

for (const project of projects) {
	const run = spawnSync('npx', ['tsc', '-p', project, '--noEmit', '--pretty', 'false'], { encoding: 'utf8' })
	const lines = `${run.stdout}${run.stderr}`.split('\n')
	const errors = lines.filter((line) => /error TS\d+/.test(line))
	const ours: string[] = []
	const known: string[] = []
	for (const line of errors) {
		const match = KNOWN_UPSTREAM.find((k) => isKnown(line, k))
		if (match) known.push(`${match.file} ${match.code}: ${match.why}`)
		else ours.push(line)
	}
	if (ours.length) {
		failed = true
		console.error(`${project}: ${ours.length} error(s)`)
		// Print our errors with their indented continuation lines; skip known upstream blocks.
		let skipping = false
		for (const line of lines) {
			if (/error TS\d+/.test(line)) skipping = KNOWN_UPSTREAM.some((k) => isKnown(line, k))
			if (!skipping && line.trim()) console.error(line)
		}
	} else {
		console.log(`${project}: ok${known.length ? ` (${known.length} known upstream: ${[...new Set(known)].join('; ')})` : ''}`)
	}
}

process.exit(failed ? 1 : 0)
