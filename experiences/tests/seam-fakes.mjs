/**
 * Stand-ins for the experiences' scroller seam tests (voice-guide ADR-0076, phase 4a): an event target
 * that counts its listeners, a window with a manual frame and timer clock, a scrolling box with its own
 * view bar, a ResizeObserver that records what it watches, and the few DOM calls dom.js makes.
 * Not a test file itself (npm test runs tests/*.test.mjs).
 */

const captureOf = (options) => Boolean(typeof options === 'object' ? options?.capture : options)

export class FakeTarget {
  constructor() {
    this.listeners = []
  }

  addEventListener(type, fn, options) {
    this.listeners.push({ type, fn, capture: captureOf(options), once: Boolean(options?.once), passive: options?.passive })
  }

  removeEventListener(type, fn, options) {
    const capture = captureOf(options)
    const at = this.listeners.findIndex((l) => l.type === type && l.fn === fn && l.capture === capture)
    if (at >= 0) this.listeners.splice(at, 1)
  }

  count(type) {
    return this.listeners.filter((l) => !type || l.type === type).length
  }

  dispatch(type, init = {}) {
    const event = {
      type,
      target: { closest: () => null },
      defaultPrevented: false,
      preventDefault() {
        this.defaultPrevented = true
      },
      stopPropagation() {},
      ...init,
    }
    for (const listener of this.listeners.filter((l) => l.type === type)) {
      if (listener.once) this.removeEventListener(type, listener.fn, { capture: listener.capture })
      listener.fn(event)
    }
    return event
  }
}

/** A window whose frames and timers run only when the test says so. */
export const fakeWindow = ({ scrollY = 0, innerHeight = 900, innerWidth = 1366 } = {}) => {
  const win = new FakeTarget()
  let nextId = 1
  Object.assign(win, {
    scrollY,
    innerHeight,
    innerWidth,
    location: { origin: 'https://example.test', href: 'https://example.test/en/page' },
    frames: new Map(),
    timers: new Map(),
    scrolls: [],
    scrollBys: [],
    scrollTo(options) {
      win.scrolls.push(options)
    },
    scrollBy(options) {
      win.scrollBys.push(options)
    },
    requestAnimationFrame(callback) {
      const id = nextId++
      win.frames.set(id, callback)
      return id
    },
    cancelAnimationFrame(id) {
      win.frames.delete(id)
    },
    setTimeout(callback, ms) {
      const id = nextId++
      win.timers.set(id, { callback, ms })
      return id
    },
    clearTimeout(id) {
      win.timers.delete(id)
    },
    matchMedia: () => ({ matches: false }),
    runFrames(now = 16) {
      const due = [...win.frames.values()]
      win.frames.clear()
      for (const callback of due) callback(now)
    },
    runTimers() {
      const due = [...win.timers.values()]
      win.timers.clear()
      for (const { callback } of due) callback()
    },
  })
  return win
}

/** A ResizeObserver that records what it watches; `live` holds the ones still observing. */
export const installResizeObserver = () => {
  const live = new Set()
  globalThis.ResizeObserver = class {
    constructor(callback) {
      this.callback = callback
      this.targets = []
    }

    observe(target) {
      this.targets.push(target)
      live.add(this)
    }

    disconnect() {
      this.targets = []
      live.delete(this)
    }
  }
  return live
}

/** A scrolling box at viewport y `top`, `height` tall, with its view bar as its first row. */
export const fakeScroller = ({ top = 120, height = 780, width = 1351, scrollTop = 0, bar = 57 } = {}) => {
  const box = new FakeTarget()
  const viewbar = bar === null ? null : { hidden: false, getBoundingClientRect: () => ({ height: viewbar.hidden ? 0 : bar }) }
  Object.assign(box, {
    clientTop: 0,
    clientHeight: height,
    clientWidth: width,
    scrollTop,
    scrolls: [],
    scrollBys: [],
    viewbar,
    getBoundingClientRect: () => ({ top, bottom: top + height, left: 0, right: width, width, height }),
    scrollTo(options) {
      box.scrolls.push(options)
    },
    scrollBy(options) {
      box.scrollBys.push(options)
    },
    querySelector: (selector) => (selector === ':scope > .aixc-viewbar' ? viewbar : null),
  })
  return box
}

/** An element whose box the test sets: { top, height } in viewport coordinates. */
export const fakeBox = (rect) => ({
  rect,
  getBoundingClientRect: () => ({ top: rect.top, bottom: rect.top + rect.height, height: rect.height, left: 0, right: 100, width: 100 }),
})

/** The DOM calls dom.js makes, on plain objects; `symbols` are the page's <symbol> elements. */
export const installDom = ({ lang = 'en', dir = 'ltr' } = {}) => {
  class Node {}
  class Text extends Node {
    constructor(data) {
      super()
      this.data = String(data)
    }

    get textContent() {
      return this.data
    }
  }
  class Element extends Node {
    constructor(localName, namespaceURI = null) {
      super()
      this.localName = localName
      this.namespaceURI = namespaceURI
      this.attributes = new Map()
      this.children = []
      this.parent = null
      this.style = { setProperty() {} }
      this.classList = { add() {}, remove() {}, toggle() {} }
    }

    setAttribute(name, value) {
      this.attributes.set(name, String(value))
    }

    getAttribute(name) {
      return this.attributes.get(name) ?? null
    }

    hasAttribute(name) {
      return this.attributes.has(name)
    }

    get id() {
      return this.getAttribute('id') ?? ''
    }

    append(...nodes) {
      for (const node of nodes) {
        node.parent = this
        this.children.push(node)
      }
    }

    addEventListener() {}

    closest(selector) {
      if (selector !== '[data-aixc]') throw new Error(`fake closest: ${selector}`)
      for (let at = this; at; at = at.parent) if (at.hasAttribute?.('data-aixc')) return at
      return null
    }

    get textContent() {
      return this.children.map((child) => child.textContent).join('')
    }

    /** This element and everything under it, in tree order. */
    walk() {
      return [this, ...this.children.flatMap((child) => (child instanceof Element ? child.walk() : []))]
    }
  }
  const body = new Element('body')
  const document = {
    documentElement: { lang, dir },
    body,
    createElement: (name) => new Element(name),
    createElementNS: (ns, name) => new Element(name, ns),
    createTextNode: (data) => new Text(data),
    getElementsByTagName: (name) => body.walk().filter((el) => el.localName === name),
    getElementById: (id) => body.walk().find((el) => el.id === id) ?? null,
    querySelector: () => null,
  }
  globalThis.Node = Node
  globalThis.document = document
  /** Adds <symbol id> to the page, inside a [data-aixc] holder when `ours`. */
  const addSymbol = (id, { ours = false } = {}) => {
    const holder = new Element('svg', 'http://www.w3.org/2000/svg')
    if (ours) holder.setAttribute('data-aixc', '')
    const symbol = new Element('symbol', 'http://www.w3.org/2000/svg')
    symbol.setAttribute('id', id)
    holder.append(symbol)
    body.append(holder)
    return symbol
  }
  return { document, body, addSymbol, Element }
}

/**
 * A view in a scrolling box for view-dialog.js viewDialog (canvas's and streaming's previews, ADR-0076 §7): the box (its view
 * bar, the shell's stage, the end band) > the experience's root (positioned: the preview's containing block) > a heading,
 * the stage, the preview <dialog> and the closing band. Elements record focus, inert, attributes and style properties;
 * `computed` is what getComputedStyle (installed here) returns for each. The dialog records show() and showModal().
 */
export const fakeDialogView = ({ top = 120, height = 780, width = 1351, bar = 57, rootTop = -343, scrollbar = 15, focusables = 3 } = {}) => {
  const doc = { activeElement: null }
  class El extends FakeTarget {
    constructor(name, { cls = '', computed = {} } = {}) {
      super()
      this.localName = name
      this.className = cls
      this.children = []
      this.parentElement = null
      this.inert = false
      this.attrs = new Map()
      this.computed = { position: 'static', overflowY: 'visible', visibility: 'visible', ...computed }
      this.props = new Map()
      this.style = { setProperty: (k, v) => this.props.set(k, v), overflowY: '', scrollbarGutter: '' }
      this.rect = { top: 0, left: 0, width: 100, height: 40 }
      this.scrollHeight = 0
      this.clientHeight = 0
      this.scrollTop = 0
      this.focused = 0
      this.nodeType = 1
      this.isConnected = true
    }

    append(...nodes) {
      for (const node of nodes) {
        node.parentElement = this
        this.children.push(node)
      }
      return this
    }

    contains(node) {
      for (let at = node; at; at = at.parentElement) if (at === this) return true
      return false
    }

    /** A selector list of tag names, [inert], [role=…] and [contenteditable], matched from here up. */
    closest(selector) {
      const parts = selector.split(',').map((part) => part.trim())
      const matches = (at) => parts.some((part) => {
        if (part === '[inert]') return at.inert
        const role = /^\[role=["']?([\w-]+)["']?\]$/.exec(part)
        if (role) return at.getAttribute('role') === role[1]
        if (part === '[contenteditable]') return at.getAttribute('contenteditable') !== null
        return at.localName === part
      })
      for (let at = this; at; at = at.parentElement) if (matches(at)) return at
      return null
    }

    getAttribute(name) {
      return this.attrs.get(name) ?? null
    }

    setAttribute(name, value) {
      this.attrs.set(name, String(value))
    }

    removeAttribute(name) {
      this.attrs.delete(name)
    }

    set tabIndex(value) {
      this.attrs.set('tabindex', String(value))
    }

    getBoundingClientRect() {
      const { top: t, left, width: w, height: h } = this.rect
      return { top: t, left, width: w, height: h, bottom: t + h, right: left + w }
    }

    getClientRects() {
      return [this.getBoundingClientRect()]
    }

    focus() {
      this.focused += 1
      doc.activeElement = this
    }

    walk() {
      return [this, ...this.children.flatMap((child) => child.walk())]
    }
  }
  const box = new El('div', { cls: 'aixc-box', computed: { position: 'relative', overflowY: 'auto' } })
  Object.assign(box, { clientTop: 0, clientLeft: 0, clientHeight: height, clientWidth: width - scrollbar, offsetWidth: width })
  box.rect = { top, left: 0, width, height }
  const viewbar = new El('div', { cls: 'aixc-viewbar' })
  viewbar.hidden = false
  viewbar.rect = { top, left: 0, width, height: bar }
  box.querySelector = (selector) => (selector === ':scope > .aixc-viewbar' ? viewbar : null)
  const shellStage = new El('div', { cls: 'aixc-stage', computed: { position: 'relative' } })
  const end = new El('div', { cls: 'aixc-end' })
  const root = new El('div', { cls: 'aixc-vx', computed: { position: 'relative' } })
  root.rect = { top: top + rootTop, left: 0, width: width - scrollbar, height: 3000 }
  Object.assign(root, { clientTop: 0 })
  const heading = new El('h1')
  const stage = new El('section', { cls: 'cv-stage' })
  const band = new El('section', { cls: 'vx-closing' })
  const dialog = new El('dialog')
  const body = new El('div', { cls: 'cv-dialog__body' })
  const controls = Array.from({ length: focusables }, (_, at) => new El(at === focusables - 1 ? 'button' : 'a'))
  body.append(...controls.slice(0, -1))
  dialog.append(body, controls[controls.length - 1])
  Object.assign(dialog, {
    open: false,
    calls: [],
    show() {
      dialog.calls.push('show')
      dialog.open = true
    },
    showModal() {
      dialog.calls.push('showModal')
      dialog.open = true
    },
    close() {
      dialog.calls.push('close')
      dialog.open = false
    },
    querySelectorAll: () => controls,
  })
  root.append(heading, stage, dialog, band)
  shellStage.append(root)
  box.append(viewbar, shellStage, end)
  const opener = new El('button', { cls: 'cv-card' })
  stage.append(opener)
  globalThis.getComputedStyle = (el) => el.computed ?? { position: 'static', overflowY: 'visible', visibility: 'visible' }
  globalThis.document = { ...(globalThis.document ?? {}), documentElement: { lang: 'en', dir: 'ltr' } }
  Object.defineProperty(globalThis.document, 'activeElement', { get: () => doc.activeElement, set: (v) => (doc.activeElement = v), configurable: true })
  return { box, viewbar, shellStage, end, root, heading, stage, band, dialog, body, controls, opener, doc, El }
}
