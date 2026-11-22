/**
 * The keys our live words pass to t(), words() and say() (O17, voice-guide ADR-0076 §11): read from the sources of
 * the thirteen experiences, their shared helpers, Reimagine's shell, composer, view bar and launcher. Not a test file
 * itself (npm test runs tests/*.test.mjs).
 */
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

export const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8')
const dir = (path) => fs.readdirSync(new URL(path, import.meta.url)).filter((name) => name.endsWith('.js')).map((name) => `${path}${name}`)
export const SOURCES = [...dir('../src/aixc/experiences/'), ...dir('../src/host/demos/reimagine/'), '../src/host/demos/reimagine.js']

/** The source without its comments (a '//' after ':' is a web address's, not a comment). */
const code = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\'"`])\/\/[^\n]*/g, '$1')

/**
 * Every key a source passes to t(), words() or say(): the string literals that open the call's argument or follow a
 * ternary's ? or : in it (t(open ? 'Turn back a page' : 'Turn the page')), not those inside its values object.
 */
export const keysIn = (source) => {
  const text = code(source)
  const keys = []
  const call = /\b(t|words|say)\(/g
  let m
  while ((m = call.exec(text))) {
    let depth = 0
    let before = '('
    for (let at = m.index + m[0].length; at < text.length; at += 1) {
      const c = text[at]
      if (c === "'" || c === '"' || c === '`') {
        let end = at + 1
        while (end < text.length && text[end] !== c) end += text[end] === '\\' ? 2 : 1
        const literal = text.slice(at + 1, end)
        if (depth === 0 && '(?:'.includes(before) && !(c === '`' && literal.includes('${'))) keys.push({ fn: m[1], key: literal.replace(/\\(.)/g, '$1') })
        before = c
        at = end
      } else if ('({['.includes(c)) depth += 1
      else if (')}]'.includes(c)) {
        if (depth === 0) break
        depth -= 1
      } else if (!/\s/.test(c)) before = c
    }
  }
  return keys
}


/** Every call's key in SOURCES, with its function and file. */
export const ALL_KEYS = SOURCES.flatMap((path) => keysIn(read(path)).map((entry) => ({ ...entry, file: path.split('/').at(-1) })))

/** Where the English our words show is recorded (microcopy-en.test.mjs compares it with the sources). */
export const ENGLISH_RECORD = new URL('./microcopy-en.json', import.meta.url)

/**
 * The English our words show, read from the sources: each file's keys by function (on an English page a key is its
 * own word), the neutral words and the composer's names for the thirteen. Import it after installRenderDom.
 */
export const englishWords = async () => {
  const byFile = {}
  for (const { fn, key, file } of ALL_KEYS) ((byFile[file] ??= {})[fn] ??= new Set()).add(key)
  const sorted = (object, each) => Object.fromEntries(Object.keys(object).sort().map((name) => [name, each(object[name])]))
  const { NEUTRAL_WORDS } = await import('../src/aixc/experiences/shared.js')
  const { TEMPLATE_CARDS } = await import('../src/aixc/template-schema.js')
  return {
    keys: sorted(byFile, (fns) => sorted(fns, (keys) => [...keys].sort())),
    neutral: sorted(NEUTRAL_WORDS, (word) => word),
    cards: Object.fromEntries(TEMPLATE_CARDS.map((card) => [card.id, card.name])),
  }
}

// `node tests/microcopy-keys.mjs --write` records the English anew, only after its words were changed on purpose.
if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1]) && process.argv.includes('--write')) {
  const { installRenderDom } = await import('./render-fakes.mjs')
  installRenderDom({ lang: 'en' })
  fs.writeFileSync(ENGLISH_RECORD, `${JSON.stringify(await englishWords(), null, 2)}\n`)
  console.log(`recorded ${ALL_KEYS.length} calls in ${fileURLToPath(ENGLISH_RECORD)}`)
}
