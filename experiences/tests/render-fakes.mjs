/**
 * A small document for rendering the thirteen experiences in Node (O17, voice-guide ADR-0076 §11): elements with
 * attributes, classes, styles and children, a selector engine for the simple selectors the renderers use, and a window
 * whose layout is all zeros. Nothing is laid out or painted: the experiences are built (render()) and mounted, and their
 * words read (collectWords, renderEachExperience), on a model whose content words are placeholders (placeholderModel).
 * Not a test file itself (npm test runs tests/*.test.mjs).
 */

class Node {
  constructor() {
    this.parentNode = null
  }

  get parentElement() {
    return this.parentNode instanceof Element ? this.parentNode : null
  }

  remove() {
    const parent = this.parentNode
    if (!parent) return
    const at = parent.childNodes.indexOf(this)
    if (at >= 0) parent.childNodes.splice(at, 1)
    this.parentNode = null
  }
}

class Text extends Node {
  constructor(data) {
    super()
    this.data = String(data)
    this.nodeType = 3
  }

  get textContent() {
    return this.data
  }

  set textContent(value) {
    this.data = String(value)
  }
}

const listeners = () => ({ addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true } })

/** One compound selector: tag, #id, .class, [attr], [attr=value], :not(compound). */
const parseCompound = (text) => {
  const parts = { tag: null, id: null, classes: [], attrs: [], nots: [] }
  const re = /^(\*|[a-zA-Z][\w-]*)|#([\w-]+)|\.([\w-]+)|\[([\w-]+)(?:([~^$*|]?=)["']?([^\]"']*)["']?)?\]|:not\(([^)]*)\)|:([\w-]+(?:\([^)]*\))?)/g
  let m
  while ((m = re.exec(text))) {
    if (m[0] === '') break
    if (m[1]) parts.tag = m[1] === '*' ? null : m[1].toLowerCase()
    else if (m[2]) parts.id = m[2]
    else if (m[3]) parts.classes.push(m[3])
    else if (m[4]) parts.attrs.push({ name: m[4], op: m[5], value: m[6] })
    else if (m[7] !== undefined) parts.nots.push(...m[7].split(',').map((s) => parseCompound(s.trim())))
    // other pseudo-classes (:focus, :hover, :focus-visible...) never match in a document with no focus or pointer
    else if (m[8]) parts.never = !/^(scope|first-child|last-child)$/.test(m[8])
  }
  return parts
}

const matchesCompound = (el, parts) => {
  if (!(el instanceof Element)) return false
  if (parts.never) return false
  if (parts.tag && el.localName !== parts.tag) return false
  if (parts.id && el.getAttribute('id') !== parts.id) return false
  for (const name of parts.classes) if (!el.classList.contains(name)) return false
  for (const { name, op, value } of parts.attrs) {
    const actual = el.getAttribute(name)
    if (actual === null) return false
    if (op === '=' && actual !== value) return false
    if (op === '~=' && !actual.split(/\s+/).includes(value)) return false
    if (op === '^=' && !actual.startsWith(value)) return false
    if (op === '*=' && !actual.includes(value)) return false
  }
  for (const not of parts.nots) if (matchesCompound(el, not)) return false
  return true
}

/** A complex selector as compounds joined by descendant or child combinators, matched right to left. */
const parseComplex = (text) => {
  const tokens = text.trim().replace(/\s*>\s*/g, ' > ').split(/\s+/)
  const steps = []
  let combinator = ' '
  for (const token of tokens) {
    if (token === '>') combinator = '>'
    else {
      steps.push({ combinator, parts: parseCompound(token) })
      combinator = ' '
    }
  }
  return steps
}

const matchesComplex = (el, steps, at = steps.length - 1) => {
  if (!matchesCompound(el, steps[at].parts)) return false
  if (at === 0) return true
  const { combinator } = steps[at]
  if (combinator === '>') return el.parentElement ? matchesComplex(el.parentElement, steps, at - 1) : false
  for (let up = el.parentElement; up; up = up.parentElement) if (matchesComplex(up, steps, at - 1)) return true
  return false
}

const splitList = (selector) => {
  const out = []
  let depth = 0
  let start = 0
  for (let i = 0; i < selector.length; i += 1) {
    const c = selector[i]
    if (c === '(' || c === '[') depth += 1
    else if (c === ')' || c === ']') depth -= 1
    else if (c === ',' && depth === 0) {
      out.push(selector.slice(start, i))
      start = i + 1
    }
  }
  out.push(selector.slice(start))
  return out.map((s) => s.trim()).filter(Boolean)
}

const matches = (el, selector) => splitList(selector).some((one) => matchesComplex(el, parseComplex(one)))

class ClassList {
  constructor(el) {
    this.el = el
  }

  get names() {
    return (this.el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean)
  }

  contains(name) {
    return this.names.includes(name)
  }

  add(...names) {
    this.el.setAttribute('class', [...new Set([...this.names, ...names])].join(' '))
  }

  remove(...names) {
    this.el.setAttribute('class', this.names.filter((n) => !names.includes(n)).join(' '))
  }

  toggle(name, force) {
    const on = force === undefined ? !this.contains(name) : Boolean(force)
    if (on) this.add(name)
    else this.remove(name)
    return on
  }
}

const zeroRect = () => ({ top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0 })

class Element extends Node {
  constructor(localName, namespaceURI = null) {
    super()
    this.nodeType = 1
    this.localName = String(localName).toLowerCase()
    this.tagName = this.localName.toUpperCase()
    this.namespaceURI = namespaceURI
    this.attrs = new Map()
    this.childNodes = []
    this.classList = new ClassList(this)
    const props = new Map()
    this.style = new Proxy(
      { setProperty: (k, v) => props.set(k, String(v)), removeProperty: (k) => props.delete(k), getPropertyValue: (k) => props.get(k) ?? '' },
      { get: (target, key) => (key in target ? target[key] : (props.get(key) ?? '')), set: (target, key, value) => (props.set(key, String(value)), true) },
    )
    this.dataset = new Proxy({}, {
      get: (t, key) => this.getAttribute(`data-${String(key).replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`) ?? undefined,
      set: (t, key, value) => (this.setAttribute(`data-${String(key).replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`, value), true),
    })
    Object.assign(this, listeners())
    this.scrollTop = 0
    this.scrollLeft = 0
    this.offsetWidth = 0
    this.offsetHeight = 0
    this.clientWidth = 0
    this.clientHeight = 0
    this.scrollWidth = 0
    this.scrollHeight = 0
    this.offsetTop = 0
    this.offsetLeft = 0
    this.clientTop = 0
    this.clientLeft = 0
  }

  setAttribute(name, value) {
    this.attrs.set(name, String(value))
  }

  getAttribute(name) {
    return this.attrs.has(name) ? this.attrs.get(name) : null
  }

  hasAttribute(name) {
    return this.attrs.has(name)
  }

  removeAttribute(name) {
    this.attrs.delete(name)
  }

  toggleAttribute(name, force) {
    const on = force === undefined ? !this.hasAttribute(name) : Boolean(force)
    if (on) this.setAttribute(name, '')
    else this.removeAttribute(name)
    return on
  }

  get id() {
    return this.getAttribute('id') ?? ''
  }

  set id(value) {
    this.setAttribute('id', value)
  }

  get className() {
    return this.getAttribute('class') ?? ''
  }

  set className(value) {
    this.setAttribute('class', value)
  }

  get hidden() {
    return this.hasAttribute('hidden')
  }

  set hidden(value) {
    this.toggleAttribute('hidden', Boolean(value))
  }

  get inert() {
    return this.hasAttribute('inert')
  }

  set inert(value) {
    this.toggleAttribute('inert', Boolean(value))
  }

  get disabled() {
    return this.hasAttribute('disabled')
  }

  set disabled(value) {
    this.toggleAttribute('disabled', Boolean(value))
  }

  get tabIndex() {
    return Number(this.getAttribute('tabindex') ?? -1)
  }

  set tabIndex(value) {
    this.setAttribute('tabindex', value)
  }

  get children() {
    return this.childNodes.filter((n) => n instanceof Element)
  }

  get firstElementChild() {
    return this.children[0] ?? null
  }

  get lastElementChild() {
    return this.children.at(-1) ?? null
  }

  get firstChild() {
    return this.childNodes[0] ?? null
  }

  get nextElementSibling() {
    const siblings = this.parentNode?.children ?? []
    return siblings[siblings.indexOf(this) + 1] ?? null
  }

  get previousElementSibling() {
    const siblings = this.parentNode?.children ?? []
    const at = siblings.indexOf(this)
    return at > 0 ? siblings[at - 1] : null
  }

  get isConnected() {
    return true
  }

  append(...nodes) {
    for (const node of nodes) {
      const child = node instanceof Node ? node : new Text(node)
      child.remove()
      child.parentNode = this
      this.childNodes.push(child)
    }
  }

  appendChild(node) {
    this.append(node)
    return node
  }

  prepend(...nodes) {
    const kids = nodes.map((node) => (node instanceof Node ? node : new Text(node)))
    for (const child of kids) {
      child.remove()
      child.parentNode = this
    }
    this.childNodes.unshift(...kids)
  }

  insertBefore(node, ref) {
    if (!ref) return this.appendChild(node)
    node.remove()
    node.parentNode = this
    this.childNodes.splice(this.childNodes.indexOf(ref), 0, node)
    return node
  }

  before(...nodes) {
    for (const node of nodes) this.parentNode?.insertBefore(node instanceof Node ? node : new Text(node), this)
  }

  after(...nodes) {
    const parent = this.parentNode
    if (!parent) return
    let ref = this
    for (const node of nodes) {
      const child = node instanceof Node ? node : new Text(node)
      const next = parent.childNodes[parent.childNodes.indexOf(ref) + 1]
      if (next) parent.insertBefore(child, next)
      else parent.appendChild(child)
      ref = child
    }
  }

  replaceChildren(...nodes) {
    for (const child of [...this.childNodes]) child.remove()
    this.append(...nodes)
  }

  replaceWith(...nodes) {
    this.before(...nodes)
    this.remove()
  }

  cloneNode(deep = false) {
    const copy = new Element(this.localName, this.namespaceURI)
    for (const [k, v] of this.attrs) copy.setAttribute(k, v)
    if (deep) for (const child of this.childNodes) copy.append(child instanceof Element ? child.cloneNode(true) : new Text(child.data))
    return copy
  }

  contains(node) {
    for (let at = node; at; at = at.parentNode) if (at === this) return true
    return false
  }

  get textContent() {
    return this.childNodes.map((child) => child.textContent).join('')
  }

  set textContent(value) {
    this.replaceChildren(new Text(value))
  }

  get innerText() {
    return this.textContent
  }

  /** This element and every element under it, in tree order. */
  walk() {
    return [this, ...this.children.flatMap((child) => child.walk())]
  }

  matches(selector) {
    return matches(this, selector)
  }

  closest(selector) {
    for (let at = this; at instanceof Element; at = at.parentNode) if (matches(at, selector)) return at
    return null
  }

  querySelectorAll(selector) {
    return this.walk().slice(1).filter((el) => matches(el, selector))
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null
  }

  getElementsByTagName(name) {
    return this.querySelectorAll(name)
  }

  getBoundingClientRect() {
    return zeroRect()
  }

  getClientRects() {
    return []
  }

  getTotalLength() {
    return 0
  }

  getPointAtLength() {
    return { x: 0, y: 0 }
  }

  focus() {}

  blur() {}

  scrollTo() {}

  scrollBy() {}

  scrollIntoView() {}

  animate() {
    return { finished: Promise.resolve(), cancel() {}, finish() {}, onfinish: null, addEventListener() {} }
  }

  getAnimations() {
    return []
  }

  show() {
    this.setAttribute('open', '')
  }

  showModal() {
    this.setAttribute('open', '')
  }

  close() {
    this.removeAttribute('open')
  }

  setPointerCapture() {}

  releasePointerCapture() {}

  hasPointerCapture() {
    return false
  }
}

/**
 * Installs a document in `lang` (with `dir`) and a window on globalThis. Returns the document and `collect(root)`, which
 * gives every word the root shows or names: its text nodes, and its alt, title, placeholder, aria-label,
 * aria-roledescription, aria-valuetext and aria-description attributes, each with the element it came from. Text under
 * an element that is aria-hidden is still shown, so it counts.
 */
export const installRenderDom = ({ lang = 'en', dir = lang === 'ar' ? 'rtl' : 'ltr' } = {}) => {
  const html = new Element('html')
  html.setAttribute('lang', lang)
  html.setAttribute('dir', dir)
  html.lang = lang
  html.dir = dir
  const head = new Element('head')
  const body = new Element('body')
  html.append(head, body)
  const document = {
    documentElement: html,
    head,
    body,
    readyState: 'complete',
    activeElement: body,
    fonts: { load: () => Promise.resolve([]), ready: Promise.resolve(), check: () => true, status: 'loaded', ...listeners() },
    createElement: (name) => new Element(name),
    createElementNS: (ns, name) => new Element(name, ns),
    createTextNode: (data) => new Text(data),
    createDocumentFragment: () => new Element('#fragment'),
    getElementById: (id) => html.walk().find((el) => el.id === id) ?? null,
    getElementsByTagName: (name) => html.querySelectorAll(name),
    querySelector: (selector) => html.querySelector(selector),
    querySelectorAll: (selector) => html.querySelectorAll(selector),
    elementFromPoint: () => null,
    hasFocus: () => false,
    ...listeners(),
  }
  const media = () => ({ matches: false, media: '', addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })
  const window = {
    document,
    innerWidth: 1366,
    innerHeight: 900,
    scrollX: 0,
    scrollY: 0,
    pageYOffset: 0,
    devicePixelRatio: 1,
    location: { origin: 'https://web.vodafone.com.eg', href: 'https://web.vodafone.com.eg/', pathname: '/', search: '', hash: '', hostname: 'web.vodafone.com.eg' },
    matchMedia: media,
    getComputedStyle: () => new Proxy({ getPropertyValue: () => '' }, { get: (t, k) => (k in t ? t[k] : '') }),
    requestAnimationFrame: () => 0,
    cancelAnimationFrame() {},
    setTimeout: () => 0,
    clearTimeout() {},
    setInterval: () => 0,
    clearInterval() {},
    scrollTo() {},
    scrollBy() {},
    visualViewport: { width: 1366, height: 900, offsetTop: 0, ...listeners() },
    navigator: { userAgent: 'node', maxTouchPoints: 0 },
    ...listeners(),
  }
  window.window = window
  class Observer {
    constructor() {}
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return []
    }
  }
  Object.assign(globalThis, {
    window,
    document,
    Node,
    Element,
    HTMLElement: Element,
    SVGElement: Element,
    Text,
    matchMedia: media,
    getComputedStyle: window.getComputedStyle,
    requestAnimationFrame: window.requestAnimationFrame,
    cancelAnimationFrame: window.cancelAnimationFrame,
    ResizeObserver: Observer,
    IntersectionObserver: Observer,
    MutationObserver: Observer,
    CSS: { escape: (s) => String(s), supports: () => true },
    location: window.location,
  })
  if (!globalThis.navigator) globalThis.navigator = window.navigator
  return { document, window, Element }
}

const WORD_ATTRIBUTES = ['alt', 'title', 'placeholder', 'aria-label', 'aria-roledescription', 'aria-valuetext', 'aria-description']

/** Every word `root` shows or names: [{ text, where }], `where` being the attribute's name or 'text'. */
export const collectWords = (root) => {
  const out = []
  const visit = (node) => {
    if (node instanceof Text) {
      if (node.data.trim()) out.push({ text: node.data, where: 'text', el: node.parentNode })
      return
    }
    // A <style> or <script> carries no words of ours for the reader.
    if (node.localName === 'style' || node.localName === 'script') return
    for (const name of WORD_ATTRIBUTES) {
      const value = node.getAttribute(name)
      if (value && value.trim()) out.push({ text: value, where: name, el: node })
    }
    for (const child of node.childNodes) visit(child)
  }
  visit(root)
  return out
}

const WORD_KEYS = new Set(['title', 'intro', 'description', 'label', 'lead', 'storesLabel'])

/**
 * The Services model of the page's language with every word of Vodafone's content replaced by a placeholder of
 * `word` and a number (ids, links and pictures kept), so whatever else a view shows or names is ours.
 */
export const placeholderModel = (model, word) => {
  let n = 0
  const swap = (value) => {
    if (Array.isArray(value)) return value.map(swap)
    if (!value || typeof value !== 'object') return value
    return Object.fromEntries(Object.entries(value).map(([key, v]) => [key, typeof v === 'string' && WORD_KEYS.has(key) ? `${word} ${(n += 1)}` : swap(v)]))
  }
  return swap(model)
}

/** A link's web address, shown as content ("LINK: web.vodafone.com.eg"): Vodafone's, not our words. */
export const WEB_ADDRESS = /\b[a-z0-9-]+(?:\.[a-z0-9-]+)+\b/gi

/**
 * Builds and mounts each of the thirteen experiences (the composer's cards, in its order) on the installed document,
 * from `model`, with the seam configured as `seam` ({ copy, scroller }); returns [{ id, words }], every word each view
 * shows or names once built and mounted (collectWords). Call installRenderDom first: i18n.js reads the page's language
 * when it loads.
 */
export const renderEachExperience = async (model, seam = {}) => {
  const { normalizeContentModel } = await import('../src/host/model.js')
  const { buildContentIndex } = await import('../src/aixc/content-index.js')
  const { buildTemplateSchema, TEMPLATE_CARDS } = await import('../src/aixc/template-schema.js')
  const { validateSchema } = await import('../src/aixc/schema-validator.js')
  const { configure } = await import('../src/aixc/experiences/shared.js')
  const { renderExperience } = await import('../src/aixc/experience-renderer.js')
  const normalized = normalizeContentModel(model)
  if (!normalized.model) throw new Error(`the model did not normalise: ${normalized.problems.join('; ')}`)
  const index = buildContentIndex(normalized.model)
  const out = []
  for (const card of TEMPLATE_CARDS) {
    const result = validateSchema(buildTemplateSchema(card, index), index)
    if (!result.ok) throw new Error(`${card.id}: ${result.errors.join('; ')}`)
    configure(seam)
    const view = renderExperience(result.schema, index, {})
    document.body.append(view.element)
    view.mount()
    out.push({ id: card.id, words: collectWords(view.element) })
    view.unmount()
    view.element.remove()
    configure()
  }
  return out
}
