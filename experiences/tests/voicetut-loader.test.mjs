// VoiceTut is an experiment: the Services page loads it only with ?demo=voicetut (ported 2026-11-05).
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')

test('the page loads VoiceTut only through its loader, never directly', () => {
  const html = read('index.html')
  assert.match(html, /<script type="module" src="\/src\/voicetut-loader\.js"><\/script>/)
  assert.doesNotMatch(html, /voicetut\/demo\.(js|css)/)
})

test('the loader starts VoiceTut only with ?demo=voicetut', () => {
  const loader = read('src/voicetut-loader.js')
  assert.match(loader, /params\.get\('demo'\) === 'voicetut'/)
  assert.match(loader, /import\('\.\/voicetut\/demo\.js'\)/)
  assert.match(loader, /catch \(error\)/, 'a failed start never breaks the page')
})

test('the panel starts closed, is never recorded, and defaults to the public demo endpoint', () => {
  const demo = read('src/voicetut/demo.js')
  assert.match(demo, /panel\.open = false/)
  assert.match(demo, /panel\.dataset\.vg = ''/)
  assert.match(demo, /endpoint\.value = ''/)
})

test('the panel sits bottom-left and stays clear of the right-hand column', () => {
  const css = read('src/voicetut/demo.css')
  const panel = /\.voicetut-demo \{([^}]*)\}/.exec(css)[1]
  assert.match(panel, /left:18px/)
  assert.doesNotMatch(panel, /right:/)
  assert.match(panel, /calc\(100vw - 120px\)/)
  assert.doesNotMatch(css, /system-ui/, 'Vodafone faces, not the system font')
})
