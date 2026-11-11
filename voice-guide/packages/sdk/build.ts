/**
 * Builds the SDK (ADR-0007): guide.js (loader, UI, executor), xray.js (X-ray drawer, on demand), agent.js (page-agent,
 * loaded only on the fallback path), sw.js (push service worker), and the Exploration Trail's three on-demand chunks
 * (ADR-0035): trail.js (timeline, consent, storage), trail-record.js (rrweb record) and trail-replay.js (rrweb replay);
 * voice-out.js, the guide's voice from VoiceTut (ADR-0047), on demand;
 * and the experience layer from ../experiences (ADR-0048): aixc/aixc.js and its chunks, ES modules.
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

export const SDK_FILES = ['guide.js', 'agent.js', 'xray.js', 'watch.js', 'sw.js', 'trail.js', 'trail-record.js', 'trail-replay.js', 'voice-out.js']

/** The experience layer's sources (the demos' modules, ADR-0046) and its build output (ADR-0048). */
export const EXPERIENCES = path.resolve(ROOT, '../experiences')
export const AIXC_ENTRY = path.join(EXPERIENCES, 'src/host/index.js')
export const AIXC_OUT = path.join(OUT, 'aixc')

export interface AixcManifestFile {
	file: string
	/** The source module this file is the entry of (relative to experiences/), or null for shared code. */
	entry: string | null
	imports: { file: string; kind: string }[]
	bytes: number
}

/**
 * The experience layer (ADR-0048): ES modules with code splitting, because the demos share code, so
 * one entry (aixc.js) and named chunks the entry imports on intent. CSS is bundled as text and
 * injected once by the layer. Skipped while the entry does not exist. Writes manifest.json (each
 * file, its entry, its imports, its size) for the size budgets.
 */
export async function buildAixc(opts: { minify?: boolean } = {}): Promise<Record<string, number>> {
	if (!fs.existsSync(AIXC_ENTRY)) return {}
	fs.rmSync(AIXC_OUT, { recursive: true, force: true })
	const result = await esbuild.build({
		bundle: true,
		format: 'esm',
		splitting: true,
		platform: 'browser',
		target: 'es2022',
		minify: opts.minify ?? true,
		charset: 'utf8',
		sourcemap: true,
		legalComments: 'linked',
		logLevel: 'warning',
		entryPoints: { aixc: AIXC_ENTRY },
		outdir: AIXC_OUT,
		entryNames: '[name]',
		chunkNames: '[name]-[hash]',
		loader: { '.css': 'text' },
		metafile: true,
	})
	const files: AixcManifestFile[] = Object.entries(result.metafile.outputs)
		.filter(([f]) => f.endsWith('.js'))
		.map(([f, o]) => ({
			file: path.basename(f),
			entry: o.entryPoint ? path.relative(EXPERIENCES, path.resolve(o.entryPoint)) : null,
			imports: o.imports.filter((i) => !i.external).map((i) => ({ file: path.basename(i.path), kind: i.kind })),
			bytes: o.bytes,
		}))
		.sort((a, b) => a.file.localeCompare(b.file))
	fs.writeFileSync(path.join(AIXC_OUT, 'manifest.json'), `${JSON.stringify({ files }, null, '\t')}\n`)
	return Object.fromEntries(files.map((f) => [`aixc/${f.file}`, f.bytes]))
}

export async function buildSdk(opts: { minify?: boolean } = {}): Promise<Record<string, number>> {
	fs.mkdirSync(OUT, { recursive: true })
	const common: esbuild.BuildOptions = {
		bundle: true,
		format: 'iife',
		platform: 'browser',
		target: 'es2022',
		minify: opts.minify ?? true,
		// Arabic strings as UTF-8, not \uXXXX escapes (3x smaller); the gateway serves charset=utf-8.
		charset: 'utf8',
		sourcemap: true,
		legalComments: 'linked',
		logLevel: 'warning',
		nodePaths: [path.join(ROOT, 'node_modules')],
		plugins: [raw, stubs, alias],
		define: { 'process.env.NODE_ENV': '"production"' },
	}
	const [aixc] = await Promise.all([
		buildAixc(opts),
		esbuild.build({ ...common, plugins: [...(opts.minify ?? true ? [cssMinify] : []), raw, stubs, alias], entryPoints: [path.join(SRC, 'index.ts')], outfile: path.join(OUT, 'guide.js') }),
		esbuild.build({ ...common, entryPoints: [path.join(SRC, 'agent.ts')], outfile: path.join(OUT, 'agent.js') }),
		esbuild.build({ ...common, plugins: [...(opts.minify ?? true ? [cssMinify] : []), raw, stubs, alias], entryPoints: [path.join(SRC, 'xray-chunk.ts')], outfile: path.join(OUT, 'xray.js') }),
		esbuild.build({ ...common, entryPoints: [path.join(SRC, 'watch-chunk.ts')], outfile: path.join(OUT, 'watch.js') }),
		esbuild.build({ ...common, entryPoints: [path.join(SRC, 'sw.ts')], outfile: path.join(OUT, 'sw.js') }),
		esbuild.build({ ...common, plugins: [...(opts.minify ?? true ? [cssMinify] : []), raw, stubs, alias], entryPoints: [path.join(SRC, 'trail-chunk.ts')], outfile: path.join(OUT, 'trail.js') }),
		esbuild.build({ ...common, entryPoints: [path.join(SRC, 'trail-record-chunk.ts')], outfile: path.join(OUT, 'trail-record.js') }),
		esbuild.build({ ...common, entryPoints: [path.join(SRC, 'trail-replay-chunk.ts')], outfile: path.join(OUT, 'trail-replay.js') }),
		esbuild.build({ ...common, entryPoints: [path.join(SRC, 'voice-out-chunk.ts')], outfile: path.join(OUT, 'voice-out.js') }),
	])
	const sizes: Record<string, number> = {}
	for (const f of SDK_FILES) sizes[f] = fs.statSync(path.join(OUT, f)).size
	return { ...sizes, ...aixc }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
	const sizes = await buildSdk({ minify: !process.argv.includes('--dev') })
	for (const [f, n] of Object.entries(sizes)) console.log(`${f.padEnd(16)} ${(n / 1024).toFixed(1)} KB`)
}
