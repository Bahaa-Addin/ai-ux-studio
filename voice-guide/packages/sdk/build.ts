/**
 * Builds the SDK (ADR-0007): guide.js (loader, UI, executor), agent.js (page-agent,
 * loaded only on the fallback path) and sw.js (push service worker).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import * as esbuild from 'esbuild'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const SRC = path.join(ROOT, 'packages/sdk/src')
const OUT = path.join(ROOT, 'packages/sdk/dist')

const raw: esbuild.Plugin = {
	name: 'raw',
	setup(b) {
		b.onResolve({ filter: /\?raw$/ }, (a) => ({ path: path.resolve(a.resolveDir, a.path.replace(/\?raw$/, '')), namespace: 'raw' }))
		b.onLoad({ filter: /.*/, namespace: 'raw' }, (a) => ({ contents: fs.readFileSync(a.path, 'utf8'), loader: 'text' }))
	},
}

/** page-agent logs through chalk and animates its own mask; we stub both (ADR-0008). */
const stubs: esbuild.Plugin = {
	name: 'stubs',
	setup(b) {
		b.onResolve({ filter: /^chalk$/ }, () => ({ path: 'chalk', namespace: 'stub' }))
		b.onResolve({ filter: /mask\/SimulatorMask$/ }, () => ({ path: 'mask', namespace: 'stub' }))
		b.onLoad({ filter: /^chalk$/, namespace: 'stub' }, () => ({
			contents: 'const f = (...a) => a.join(" "); const c = new Proxy(f, { get: () => c, apply: (_t, _s, a) => a.join(" ") }); export default c;',
			loader: 'js',
		}))
		b.onLoad({ filter: /^mask$/, namespace: 'stub' }, () => ({ contents: 'export class SimulatorMask { show() {} hide() {} dispose() {} }', loader: 'js' }))
	},
}

/**
 * CSS lives in template literals (one shadow root, ADR-0020), which the minifier leaves alone.
 * Collapses their whitespace at build time: about 1 KB gzipped off guide.js (PRD §9 size budget).
 */
const cssMinify: esbuild.Plugin = {
	name: 'css-minify',
	setup(b) {
		b.onLoad({ filter: /packages[\\/]sdk[\\/]src[\\/].*\.ts$/ }, (a) => {
			const src = fs.readFileSync(a.path, 'utf8')
			if (!/CSS = (\(th: Theme\) => )?`/.test(src)) return undefined
			const contents = src.replace(/(CSS = (?:\(th: Theme\) => )?`)([^`]*)`/g, (_m, head: string, css: string) => {
				const min = css
					.replace(/\/\*[\s\S]*?\*\//g, '')
					.replace(/\s+/g, ' ')
					.replace(/\s*([{};,])\s*/g, '$1')
					.replace(/;}/g, '}')
					.replace(/: /g, ':')
					.trim()
				return `${head}${min}\``
			})
			return { contents, loader: 'ts' }
		})
	},
}

/** Resolves the repo's `#kb` alias for browser builds (types only are imported by the SDK). */
const alias: esbuild.Plugin = {
	name: 'alias',
	setup(b) {
		b.onResolve({ filter: /^#kb$/ }, () => ({ path: path.join(ROOT, 'packages/kb/src/browser.ts') }))
	},
}

export async function buildSdk(opts: { minify?: boolean } = {}): Promise<Record<string, number>> {
	fs.mkdirSync(OUT, { recursive: true })
	const common: esbuild.BuildOptions = {
		bundle: true,
		format: 'iife',
		platform: 'browser',
		target: 'es2022',
		minify: opts.minify ?? true,
		sourcemap: true,
		legalComments: 'linked',
		logLevel: 'warning',
		nodePaths: [path.join(ROOT, 'node_modules')],
		plugins: [raw, stubs, alias],
		define: { 'process.env.NODE_ENV': '"production"' },
	}
	await Promise.all([
		esbuild.build({ ...common, plugins: [...(opts.minify ?? true ? [cssMinify] : []), raw, stubs, alias], entryPoints: [path.join(SRC, 'index.ts')], outfile: path.join(OUT, 'guide.js') }),
		esbuild.build({ ...common, entryPoints: [path.join(SRC, 'agent.ts')], outfile: path.join(OUT, 'agent.js') }),
		esbuild.build({ ...common, entryPoints: [path.join(SRC, 'sw.ts')], outfile: path.join(OUT, 'sw.js') }),
	])
	const sizes: Record<string, number> = {}
	for (const f of ['guide.js', 'agent.js', 'sw.js']) sizes[f] = fs.statSync(path.join(OUT, f)).size
	return sizes
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
	const sizes = await buildSdk({ minify: !process.argv.includes('--dev') })
	for (const [f, n] of Object.entries(sizes)) console.log(`${f.padEnd(9)} ${(n / 1024).toFixed(1)} KB`)
}
