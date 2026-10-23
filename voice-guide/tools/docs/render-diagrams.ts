/**
 * Renders every ```mermaid block in docs/diagrams/*.md to docs/diagrams/svg/<file>-<n>.svg.
 * Doubles as a syntax check: a diagram that does not parse fails the run.
 *
 *   npm run docs:diagrams
 *
 * Needs the Mermaid CLI (pinned, fetched by npx) and a Chromium. Set PUPPETEER_EXECUTABLE_PATH
 * to reuse Playwright's Chromium, for example /opt/pw-browsers/chromium-1194/chrome-linux/chrome.
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '../..')
const DIR = path.join(ROOT, 'docs/diagrams')
const OUT = path.join(DIR, 'svg')
const MMDC = process.env.MMDC || 'npx --yes -p @mermaid-js/mermaid-cli@11.16.0 mmdc'

fs.mkdirSync(OUT, { recursive: true })
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vg-diagrams-'))
const puppeteerConfig = path.join(tmp, 'puppeteer.json')
fs.writeFileSync(
	puppeteerConfig,
	JSON.stringify({ args: ['--no-sandbox'], ...(process.env.PUPPETEER_EXECUTABLE_PATH ? { executablePath: process.env.PUPPETEER_EXECUTABLE_PATH } : {}) }),
)

let failed = 0
let rendered = 0
for (const file of fs.readdirSync(DIR).filter((f) => /^\d\d-.*\.md$/.test(f)).sort()) {
	const blocks = [...fs.readFileSync(path.join(DIR, file), 'utf8').matchAll(/```mermaid\n([\s\S]*?)```/g)].map((m) => m[1])
	blocks.forEach((src, i) => {
		const input = path.join(tmp, `${file}-${i + 1}.mmd`)
		const output = path.join(OUT, `${file.replace(/\.md$/, '')}${blocks.length > 1 ? `-${i + 1}` : ''}.svg`)
		fs.writeFileSync(input, src)
		const [cmd, ...args] = MMDC.split(' ')
		const run = spawnSync(cmd, [...args, '-q', '-p', puppeteerConfig, '-b', 'transparent', '-i', input, '-o', output], { encoding: 'utf8' })
		if (run.status === 0) {
			rendered++
			console.log(`ok   ${path.relative(ROOT, output)}`)
		} else {
			failed++
			console.error(`FAIL ${file} block ${i + 1}\n${run.stderr || run.stdout}`)
		}
	})
}
fs.rmSync(tmp, { recursive: true, force: true })
console.log(`${rendered} rendered, ${failed} failed`)
process.exit(failed ? 1 : 0)
