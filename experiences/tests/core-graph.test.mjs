// The live layer's core (src/host/index.js and every module it imports statically) never reaches
// src/aixc/content-index.js (phase 4 design §3.5). The composer and the experiences import that index on
// intent; esbuild puts a file that both they and the core reach into a chunk the core loads with it
// (measured +825 B gzipped on the core on 2026-11-17, over its budget). The model's check the core needs
// is src/host/model.js, which imports nothing.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SRC = fileURLToPath(new URL('../src/', import.meta.url))

// A static import or re-export (`import x from './a.js'`, `import './a.js'`, `export { x } from './a.js'`), not import().
const STATIC = /^[ \t]*(?:import|export)\b[^'"();]*?\bfrom\s*['"]([^'"]+)['"]|^[ \t]*import\s*['"]([^'"]+)['"]/gm

/** The modules a file imports statically, as paths under src/, and every module those import. */
const staticGraph = (entry) => {
  const seen = new Set([path.join(SRC, entry)])
  for (const file of seen) {
    for (const match of fs.readFileSync(file, 'utf8').matchAll(STATIC)) {
      const spec = match[1] ?? match[2]
      if (spec.startsWith('.')) seen.add(path.resolve(path.dirname(file), spec))
    }
  }
  return [...seen].map((file) => path.relative(SRC, file).split(path.sep).join('/'))
}

test('the core\'s static graph holds the live adapter and the model\'s check, never content-index.js', () => {
  const core = staticGraph('host/index.js')
  assert.ok(!core.includes('aixc/content-index.js'), `content-index.js is not in the core (${core.join(', ')})`)
  for (const module of ['host/index.js', 'host/guard.js', 'host/live-adapter.js', 'host/page-host.js', 'host/recognisers.js', 'host/model.js']) assert.ok(core.includes(module), `${module} is in the core (${core.join(', ')})`)
  assert.deepEqual(staticGraph('host/model.js'), ['host/model.js'], 'the model\'s check imports nothing')
})

test('the walker sees what it must: content-index.js through the experiences\' shared code', () => {
  assert.ok(staticGraph('aixc/experiences/shared.js').includes('aixc/content-index.js'))
  assert.ok(staticGraph('aixc/schema-validator.js').includes('aixc/content-index.js'))
})
