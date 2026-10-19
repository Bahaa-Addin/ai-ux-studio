/**
 * AIXC application controller.
 *
 * Owns: the launcher, the prompt composer, the Original/Reimagined/Reset bar,
 * request sequencing, the prompt→schema cache and error/fallback handling.
 * It never renders page content itself; that is the experience renderer's job.
 *
 * States: original → composer-open → generating → transformed | error
 * (kept in `state`; `view` is what the main region shows).
 */

import { h, pathIcon } from './dom.js'
import { buildContentIndex, buildModelPayload, contentFingerprint } from './content-index.js'
import { validateSchema, assertComplete } from './schema-validator.js'
import { buildFallbackSchema } from './fallback-schema.js'
import { DEFAULT_MODEL, GeminiError, requestComposition } from './gemini-client.js'
import { experienceLabel, renderExperience } from './experience-renderer.js'

const SUGGESTIONS = [
  'Turn this into an editorial magazine.',
  'Create a bold magazine cover and distinct sections for each service category.',
  'Make the services easier to explore visually, while keeping all the original content.',
  'Use a premium editorial look with asymmetric sections and strong typography.',
  'Make it more compact but keep all service details.',
]

const ICON_SPARKLE = 'M11 2.5 13.1 9 19.5 11l-6.4 2.1L11 19.5 8.9 13.1 2.5 11 8.9 9zM19 2l.9 2.6 2.6.9-2.6.9L19 9l-.9-2.6-2.6-.9 2.6-.9z'
const ICON_CLOSE = 'M18.3 7.1 16.9 5.7 12 10.6 7.1 5.7 5.7 7.1l4.9 4.9-4.9 4.9 1.4 1.4 4.9-4.9 4.9 4.9 1.4-1.4-4.9-4.9z'

const STORAGE_KEY = 'aixc.gemini.v1'
const DEBUG = new URLSearchParams(window.location.search).has('aixc-debug')

/* ---------------------------------------------------------------- settings */

const envValue = (name) => {
  try {
    return import.meta.env?.[name] || ''
  } catch {
    return ''
  }
}

const loadSettings = () => {
  let stored = {}
  try {
    stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}') || {}
  } catch {
    stored = {}
  }
  return {
    apiKey: stored.apiKey || envValue('VITE_GEMINI_API_KEY'),
    model: stored.model || envValue('VITE_GEMINI_MODEL') || DEFAULT_MODEL,
    remember: Boolean(stored.apiKey),
    fromEnv: !stored.apiKey && Boolean(envValue('VITE_GEMINI_API_KEY')),
  }
}

const persistSettings = (settings) => {
  try {
    if (settings.remember && settings.apiKey) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ apiKey: settings.apiKey, model: settings.model }))
    } else {
      window.localStorage.removeItem(STORAGE_KEY)
    }
  } catch {
    // Storage can be unavailable (private mode); the key then lives in memory only.
  }
}

/* -------------------------------------------------------------- controller */

export const initComposer = ({ adapter, regions }) => {
  const { sourceRoot, outputRoot, viewbar, header, main } = regions

  const extraction = adapter.extractContent(sourceRoot)
  if (extraction.problems.length) console.warn('[AIXC] content extraction problems:', extraction.problems)
  const index = extraction.model ? buildContentIndex(extraction.model) : null
  const hasContent = Boolean(index && index.order.length)
  const fingerprint = hasContent ? contentFingerprint(index) : ''
  const payload = hasContent ? buildModelPayload(index) : null

  const settings = loadSettings()
  const cache = new Map()
  const state = {
    view: 'original',
    isComposerOpen: false,
    isGenerating: false,
    activePrompt: '',
    lastValidSchema: null,
    lastMeta: null,
    lastError: null,
    requestSeq: 0,
    abortController: null,
    userPickedOriginalWhileGenerating: false,
  }

  /* ----------------------------------------------------------- live region */
  const liveRegion = h('div', { class: 'aixc-sr-only', role: 'status', 'aria-live': 'polite' })
  const announce = (text) => {
    liveRegion.textContent = ''
    window.setTimeout(() => {
      liveRegion.textContent = text
    }, 60)
  }

  /* -------------------------------------------------------------- launcher */
  const launcher = h(
    'button',
    { type: 'button', class: 'aixc-launcher', 'aria-expanded': 'false', 'aria-controls': 'aixc-composer' },
    pathIcon(ICON_SPARKLE, 'aixc-launcher__icon'),
    h('span', null, 'Reimagine this page'),
  )

  /* -------------------------------------------------------------- composer */
  const promptInput = h('textarea', {
    id: 'aixc-prompt',
    class: 'aixc-prompt',
    rows: '3',
    placeholder: 'Describe how you’d like to experience this page…',
    autocomplete: 'off',
    spellcheck: 'true',
    'aria-describedby': 'aixc-prompt-hint',
  })
  const submitButton = h('button', { type: 'submit', class: 'aixc-btn aixc-btn--primary' }, 'Reimagine')
  const cancelButton = h('button', { type: 'button', class: 'aixc-btn aixc-btn--ghost', hidden: true }, 'Cancel')
  const progress = h(
    'div',
    { class: 'aixc-progress', hidden: true },
    h('span', { class: 'aixc-progress__bar', 'aria-hidden': 'true' }),
    h('span', { class: 'aixc-progress__label' }, 'Composing your page…'),
  )
  const message = h('p', { class: 'aixc-message', hidden: true })
  const suggestionButtons = SUGGESTIONS.map((text) => h('button', { type: 'button', class: 'aixc-chip' }, text))

  const keyInput = h('input', { id: 'aixc-key', class: 'aixc-input', type: 'password', autocomplete: 'off', spellcheck: 'false', placeholder: 'Paste a Gemini API key' })
  const modelInput = h('input', { id: 'aixc-model', class: 'aixc-input', type: 'text', autocomplete: 'off', spellcheck: 'false', value: settings.model })
  const rememberInput = h('input', { id: 'aixc-remember', type: 'checkbox' })
  rememberInput.checked = settings.remember
  const keyStatus = h('span', { class: 'aixc-settings__status' })
  const saveKeyButton = h('button', { type: 'button', class: 'aixc-btn aixc-btn--small' }, 'Save settings')
  const forgetKeyButton = h('button', { type: 'button', class: 'aixc-btn aixc-btn--small aixc-btn--ghost' }, 'Remove key')
  const builtInButton = h('button', { type: 'button', class: 'aixc-btn aixc-btn--small aixc-btn--ghost' }, 'Use built-in layout')

  const settingsPanel = h(
    'details',
    { class: 'aixc-settings' },
    h('summary', null, 'Gemini settings', keyStatus),
    h(
      'div',
      { class: 'aixc-settings__body' },
      h('label', { class: 'aixc-field', for: 'aixc-key' }, h('span', null, 'API key'), keyInput),
      h('label', { class: 'aixc-field', for: 'aixc-model' }, h('span', null, 'Model'), modelInput),
      h('label', { class: 'aixc-check', for: 'aixc-remember' }, rememberInput, h('span', null, 'Remember the key in this browser')),
      h(
        'p',
        { class: 'aixc-warning' },
        'This prototype calls Gemini straight from your browser, so the key is readable by anyone using this page. Use a restricted test key, and never deploy this publicly without a server-side proxy.',
      ),
      h('div', { class: 'aixc-settings__actions' }, saveKeyButton, forgetKeyButton, builtInButton),
    ),
  )

  const closeButton = h('button', { type: 'button', class: 'aixc-icon-btn', 'aria-label': 'Close composer' }, pathIcon(ICON_CLOSE, 'aixc-icon'))
  const form = h(
    'form',
    { class: 'aixc-composer__form', novalidate: null },
    h('label', { class: 'aixc-sr-only', for: 'aixc-prompt' }, 'Describe the presentation you want'),
    promptInput,
    h('div', { class: 'aixc-suggestions', role: 'group', 'aria-label': 'Suggested prompts' }, suggestionButtons),
    h('div', { class: 'aixc-composer__actions' }, submitButton, cancelButton, progress),
    message,
  )
  const composer = h(
    'section',
    { id: 'aixc-composer', class: 'aixc-composer', 'aria-labelledby': 'aixc-composer-title', hidden: true },
    h('header', { class: 'aixc-composer__head' }, h('h2', { id: 'aixc-composer-title', class: 'aixc-composer__title' }, 'Reimagine this page'), closeButton),
    h(
      'p',
      { class: 'aixc-composer__hint', id: 'aixc-prompt-hint' },
      'Describe a new way to present this page. The same Vodafone services, descriptions and links are recomposed; nothing is added.',
    ),
    form,
    settingsPanel,
  )

  /* --------------------------------------------------------------- viewbar */
  const originalButton = h('button', { type: 'button', class: 'aixc-seg', 'aria-pressed': 'true' }, 'Original')
  const reimaginedButton = h('button', { type: 'button', class: 'aixc-seg', 'aria-pressed': 'false' }, 'Reimagined')
  const metaLabel = h('span', { class: 'aixc-viewbar__label' })
  const metaSource = h('span', { class: 'aixc-viewbar__source' })
  const editButton = h('button', { type: 'button', class: 'aixc-btn aixc-btn--text' }, 'Edit prompt')
  const resetButton = h('button', { type: 'button', class: 'aixc-btn aixc-btn--text' }, 'Reset')
  const viewNote = h('p', { class: 'aixc-viewnote', hidden: true })
  viewbar.append(
    h(
      'div',
      { class: 'aixc-viewbar__inner' },
      h('div', { class: 'aixc-segmented', role: 'group', 'aria-label': 'Page view' }, originalButton, reimaginedButton),
      h('p', { class: 'aixc-viewbar__meta' }, metaLabel, metaSource),
      h('div', { class: 'aixc-viewbar__actions' }, editButton, resetButton),
    ),
  )
  // The note scrolls with the page instead of living in the sticky bar.
  viewbar.after(viewNote)
  viewbar.setAttribute('aria-label', 'Page view controls')
  viewbar.setAttribute('role', 'region')

  document.body.append(launcher, composer, liveRegion)

  /* --------------------------------------------------------- layout helpers */
  const syncHeaderOffset = () => {
    document.documentElement.style.setProperty('--aixc-header-h', `${Math.round(header.getBoundingClientRect().height)}px`)
  }
  syncHeaderOffset()
  if (typeof ResizeObserver === 'function') new ResizeObserver(syncHeaderOffset).observe(header)

  const updateKeyStatus = () => {
    keyStatus.textContent = settings.apiKey ? (settings.fromEnv ? 'Key from .env.local' : 'Key added') : 'Not configured'
    keyStatus.dataset.state = settings.apiKey ? 'ok' : 'missing'
    forgetKeyButton.hidden = !settings.apiKey || settings.fromEnv
  }
  updateKeyStatus()

  const showMessage = (text, tone = 'info') => {
    message.textContent = text
    message.dataset.tone = tone
    message.hidden = !text
    // Errors interrupt; info is announced politely.
    message.setAttribute('role', tone === 'error' ? 'alert' : 'status')
  }

  const setGenerating = (isGenerating) => {
    state.isGenerating = isGenerating
    submitButton.disabled = isGenerating
    suggestionButtons.forEach((button) => (button.disabled = isGenerating))
    promptInput.readOnly = isGenerating
    cancelButton.hidden = !isGenerating
    progress.hidden = !isGenerating
    composer.setAttribute('aria-busy', String(isGenerating))
    launcher.classList.toggle('is-busy', isGenerating)
  }

  /* -------------------------------------------------------------- composer */
  // The floating launcher is only needed until a transformation exists; after
  // that the view bar's "Edit prompt" opens the composer without covering content.
  const syncLauncher = () => {
    launcher.hidden = state.isComposerOpen || Boolean(state.lastValidSchema)
  }

  let returnFocusTo = launcher
  const openComposer = (opener = launcher) => {
    returnFocusTo = opener
    state.isComposerOpen = true
    composer.hidden = false
    launcher.setAttribute('aria-expanded', 'true')
    syncLauncher()
    if (!hasContent) {
      showMessage('This page has no content that can be recomposed.', 'error')
      submitButton.disabled = true
    }
    promptInput.focus()
  }

  const closeComposer = ({ restoreFocus = true } = {}) => {
    state.isComposerOpen = false
    composer.hidden = true
    launcher.setAttribute('aria-expanded', 'false')
    syncLauncher()
    if (!restoreFocus) return
    const target = [returnFocusTo, launcher, editButton].find((node) => node?.isConnected && !node.hidden && !node.closest('[hidden]'))
    target?.focus()
  }

  /* ----------------------------------------------------------------- views */
  const showView = (view, { focusContent = false } = {}) => {
    if (view === 'reimagined' && !state.lastValidSchema) return
    const hiddenRoot = view === 'original' ? outputRoot : sourceRoot
    const focusWasInside = hiddenRoot.contains(document.activeElement)

    sourceRoot.hidden = view !== 'original'
    outputRoot.hidden = view !== 'reimagined'
    state.view = view
    originalButton.setAttribute('aria-pressed', String(view === 'original'))
    reimaginedButton.setAttribute('aria-pressed', String(view === 'reimagined'))
    document.body.dataset.aixcView = view
    viewNote.classList.toggle('is-muted', view !== 'reimagined')

    if (focusContent && view === 'reimagined') {
      const title = outputRoot.querySelector('#aixc-cover-title')
      main.scrollIntoView({ block: 'start' })
      title?.focus({ preventScroll: true })
    } else if (focusWasInside) {
      ;(view === 'original' ? originalButton : reimaginedButton).focus()
    }
  }

  const describeSource = (meta) => {
    if (meta.source === 'built-in') return 'Built-in layout, not AI-generated'
    return `Composed by Gemini (${meta.model})`
  }

  const renderSchema = (result, meta) => {
    if (DEBUG) assertComplete(result.schema, index)
    const { element, afterMount } = renderExperience(result.schema, index, {
      onPrimitiveError: (section, error) => console.error(`[AIXC] ${section.type} "${section.id}" failed; shown as a list.`, error),
    })
    outputRoot.replaceChildren(element)
    afterMount.forEach((callback) => callback())

    state.lastValidSchema = result.schema
    state.lastMeta = meta
    viewbar.hidden = false
    syncLauncher()
    metaLabel.textContent = experienceLabel(result.schema.experience)
    metaSource.textContent = describeSource(meta)

    const notes = []
    if (result.schema.scope === 'filtered') {
      notes.push(`Filtered view: ${result.stats.placedItems} of ${result.stats.totalItems} items shown, as requested. Original shows everything.`)
    }
    if (result.stats.restoredItems > 0 && meta.source !== 'built-in') {
      notes.push(`${result.stats.restoredItems} ${result.stats.restoredItems === 1 ? 'item' : 'items'} left out by the layout ${result.stats.restoredItems === 1 ? 'was' : 'were'} added back so nothing is lost.`)
    }
    viewNote.textContent = notes.join(' ')
    viewNote.hidden = notes.length === 0

    if (DEBUG) {
      console.groupCollapsed(`[AIXC] rendered (${meta.source})`)
      console.log('schema', result.schema)
      console.log('warnings', result.warnings)
      console.log('stats', result.stats)
      console.groupEnd()
    }
  }

  const apply = (result, meta) => {
    renderSchema(result, meta)
    const stayOnOriginal = state.userPickedOriginalWhileGenerating
    state.userPickedOriginalWhileGenerating = false
    if (stayOnOriginal) {
      announce('Your reimagined layout is ready. Choose Reimagined to see it.')
      showMessage('Your reimagined layout is ready. Choose Reimagined to see it.', 'info')
      return
    }
    if (state.isComposerOpen) closeComposer({ restoreFocus: false })
    showView('reimagined', { focusContent: true })
    const extra = result.schema.unsupportedRequest
      ? ' Only the magazine experience is available so far, so your request was applied as a magazine layout.'
      : ''
    announce(`${experienceLabel(result.schema.experience)} ready. ${describeSource(meta)}.${extra}`)
    if (extra) {
      viewNote.textContent = `${viewNote.textContent} ${extra.trim()}`.trim()
      viewNote.hidden = false
    }
  }

  const builtInResult = (prompt) => {
    const result = validateSchema(buildFallbackSchema(index, { prompt }), index, { prompt })
    if (!result.ok) throw new Error(`AIXC: built-in schema is invalid: ${result.errors.join('; ')}`)
    return result
  }

  const cacheKey = (prompt) => `${fingerprint}|${settings.model}|${prompt.trim().toLowerCase().replace(/\s+/g, ' ')}`

  const failureText = (error) => {
    if (error instanceof GeminiError) return error.message
    return 'Gemini returned a layout that could not be used.'
  }

  /* ---------------------------------------------------------------- submit */
  const submit = async (rawPrompt, { forceBuiltIn = false } = {}) => {
    const prompt = rawPrompt.trim()
    if (!hasContent) {
      showMessage('This page has no content that can be recomposed.', 'error')
      return
    }
    if (!prompt && !forceBuiltIn) {
      showMessage('Describe the presentation you want, or pick a suggestion.', 'error')
      promptInput.focus()
      return
    }
    if (state.isGenerating) return

    state.activePrompt = prompt
    showMessage('')

    if (forceBuiltIn || !settings.apiKey) {
      apply(builtInResult(prompt), { source: 'built-in', prompt })
      if (!forceBuiltIn) {
        showMessage('Showing the built-in layout. Add a Gemini API key in Gemini settings to compose from your prompt.', 'info')
        viewNote.textContent = 'Gemini is not configured, so the built-in magazine layout is shown. Add a key in Gemini settings to compose from your prompt.'
        viewNote.hidden = false
      }
      return
    }

    const key = cacheKey(prompt)
    if (cache.has(key)) {
      apply(cache.get(key), { source: 'gemini', model: settings.model, prompt, cached: true })
      return
    }

    const seq = ++state.requestSeq
    state.abortController = new AbortController()
    state.userPickedOriginalWhileGenerating = false
    setGenerating(true)
    announce('Composing your page.')

    try {
      const raw = await requestComposition({
        apiKey: settings.apiKey,
        model: settings.model,
        prompt,
        payload,
        signal: state.abortController.signal,
      })
      if (seq !== state.requestSeq) return // a newer request or a reset superseded this one
      const result = validateSchema(raw, index, { prompt })
      if (DEBUG && result.warnings.length) console.warn('[AIXC] schema warnings', result.warnings)
      if (!result.ok) {
        const error = new Error(result.errors.join(' '))
        error.validation = result
        throw error
      }
      cache.set(key, result)
      state.lastError = null
      apply(result, { source: 'gemini', model: settings.model, prompt })
    } catch (error) {
      if (seq !== state.requestSeq) return
      if (error instanceof GeminiError && error.code === 'aborted') {
        showMessage('Request cancelled. Your current view is unchanged.', 'info')
        return
      }
      state.lastError = error
      console.warn('[AIXC] generation failed:', error.code ?? 'invalid-schema', error.detail ?? error.message)
      const reason = failureText(error)
      const unsupported = error.validation?.errors?.some((text) => /not available/.test(text))
      if (state.lastValidSchema) {
        showMessage(`${reason} Your current view is unchanged.`, 'error')
        announce(`${reason} Your current view is unchanged.`)
      } else {
        apply(builtInResult(prompt), { source: 'built-in', prompt })
        const note = unsupported
          ? 'That experience is not available yet, so the built-in magazine layout is shown.'
          : `${reason} Showing the built-in magazine layout instead.`
        viewNote.textContent = note
        viewNote.hidden = false
        showMessage(note, 'error')
      }
    } finally {
      if (seq === state.requestSeq) {
        setGenerating(false)
        state.abortController = null
      }
    }
  }

  const cancel = () => {
    if (!state.isGenerating) return
    state.abortController?.abort()
  }

  const reset = () => {
    if (state.isGenerating) {
      state.requestSeq += 1 // drop whatever is in flight
      state.abortController?.abort()
      setGenerating(false)
    }
    state.lastValidSchema = null
    state.lastMeta = null
    state.lastError = null
    state.userPickedOriginalWhileGenerating = false
    showView('original')
    outputRoot.replaceChildren()
    viewbar.hidden = true
    viewNote.hidden = true
    showMessage('')
    syncLauncher()
    announce('Page reset to the original view.')
    launcher.focus()
  }

  /* ---------------------------------------------------------------- events */
  launcher.addEventListener('click', () => openComposer(launcher))
  closeButton.addEventListener('click', () => closeComposer())
  composer.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      closeComposer()
    }
  })
  promptInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault()
      form.requestSubmit()
    }
  })
  form.addEventListener('submit', (event) => {
    event.preventDefault()
    submit(promptInput.value)
  })
  suggestionButtons.forEach((button) =>
    button.addEventListener('click', () => {
      promptInput.value = button.textContent
      submit(button.textContent)
    }),
  )
  cancelButton.addEventListener('click', cancel)

  saveKeyButton.addEventListener('click', () => {
    const typedKey = keyInput.value.trim()
    if (typedKey) {
      settings.apiKey = typedKey
      settings.fromEnv = false
    }
    settings.model = modelInput.value.trim() || DEFAULT_MODEL
    modelInput.value = settings.model
    settings.remember = rememberInput.checked
    persistSettings(settings)
    keyInput.value = ''
    updateKeyStatus()
    showMessage(settings.apiKey ? 'Gemini settings saved.' : 'Model saved. Add an API key to use Gemini.', 'info')
  })
  forgetKeyButton.addEventListener('click', () => {
    settings.apiKey = envValue('VITE_GEMINI_API_KEY')
    settings.fromEnv = Boolean(settings.apiKey)
    settings.remember = false
    rememberInput.checked = false
    persistSettings(settings)
    updateKeyStatus()
    showMessage('API key removed from this browser.', 'info')
  })
  builtInButton.addEventListener('click', () => submit(promptInput.value, { forceBuiltIn: true }))

  originalButton.addEventListener('click', () => {
    if (state.isGenerating) state.userPickedOriginalWhileGenerating = true
    showView('original')
  })
  reimaginedButton.addEventListener('click', () => {
    state.userPickedOriginalWhileGenerating = false
    showView('reimagined')
  })
  editButton.addEventListener('click', () => {
    promptInput.value = state.activePrompt
    openComposer(editButton)
  })
  resetButton.addEventListener('click', reset)

  if (DEBUG) {
    window.__aixc = { state, cache, index, settings, submit, reset, showView, validateSchema: (raw, prompt) => validateSchema(raw, index, { prompt }) }
    console.info('[AIXC] debug mode on. window.__aixc is available.', { problems: extraction.problems })
  }

  return { state }
}
