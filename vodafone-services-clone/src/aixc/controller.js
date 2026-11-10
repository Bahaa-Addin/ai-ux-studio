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
import { experienceLabel, renderExperience, warmExperiences } from './experience-renderer.js'
import { TEMPLATES, buildTemplateSchema, matchTemplate } from './templates.js'
import { countItems, lang, t } from '../i18n.js'

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
    activeExperience: null,
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
    h('span', null, t('Reimagine this page')),
  )

  /* -------------------------------------------------------------- composer */
  const promptInput = h('textarea', {
    id: 'aixc-prompt',
    class: 'aixc-prompt',
    rows: '3',
    placeholder: t('Describe how you’d like to experience this page…'),
    autocomplete: 'off',
    spellcheck: 'true',
    'aria-describedby': 'aixc-prompt-hint',
  })
  const submitButton = h('button', { type: 'submit', class: 'aixc-btn aixc-btn--primary' }, t('Reimagine'))
  const cancelButton = h('button', { type: 'button', class: 'aixc-btn aixc-btn--ghost', hidden: true }, t('Cancel'))
  const progress = h(
    'div',
    { class: 'aixc-progress', hidden: true },
    h('span', { class: 'aixc-progress__bar', 'aria-hidden': 'true' }),
    h('span', { class: 'aixc-progress__label' }, t('Composing your page…')),
  )
  const message = h('p', { class: 'aixc-message', hidden: true })

  // Ready-made experiences: one click, rendered locally, no API key.
  const templateButtons = TEMPLATES.map((template) => {
    const icon = pathIcon(template.icon, 'aixc-template__icon')
    const button = h(
      'button',
      { type: 'button', class: 'aixc-template', 'data-template': template.id, 'aria-pressed': 'false' },
      icon,
      h('span', { class: 'aixc-template__text' }, h('span', { class: 'aixc-template__name' }, t(template.name)), h('span', { class: 'aixc-template__prompt' }, t(template.prompt))),
    )
    button.addEventListener('click', () => applyTemplate(template))
    return button
  })
  // The CodePen each template is adapted from (a sibling of the button: a link can't sit inside one).
  // Pen titles and authors are Latin: isolate them (FSI…PDI) so they stay whole runs in Arabic text.
  const isolate = (text) => `\u2068${text}\u2069`
  const creditText = ({ title, author }) => t('Inspired by {title} by {author}', { title: isolate(title), author: isolate(author) })
  const templateCredit = ({ reference }) =>
    reference &&
    h(
      'a',
      {
        class: 'aixc-template__credit',
        href: reference.url,
        target: '_blank',
        rel: 'noopener noreferrer',
        title: reference.url,
        'aria-label': `${creditText(reference)} ${t('(opens in a new tab)')}`,
      },
      creditText(reference),
    )
  const templatesPanel = h(
    'section',
    { class: 'aixc-templates', 'aria-labelledby': 'aixc-templates-title' },
    h('h3', { class: 'aixc-templates__title', id: 'aixc-templates-title' }, t('Ready-made experiences')),
    h('p', { class: 'aixc-templates__hint' }, t('One click, no API key. Each keeps every service, description and link.')),
    h(
      'ul',
      { class: 'aixc-templates__list' },
      templateButtons.map((button, i) => h('li', { class: 'aixc-templates__item' }, button, templateCredit(TEMPLATES[i]))),
    ),
  )

  const keyInput = h('input', { id: 'aixc-key', class: 'aixc-input', type: 'password', autocomplete: 'off', spellcheck: 'false', placeholder: t('Paste a Gemini API key') })
  const modelInput = h('input', { id: 'aixc-model', class: 'aixc-input', type: 'text', autocomplete: 'off', spellcheck: 'false', value: settings.model })
  const rememberInput = h('input', { id: 'aixc-remember', type: 'checkbox' })
  rememberInput.checked = settings.remember
  const keyStatus = h('span', { class: 'aixc-settings__status' })
  const saveKeyButton = h('button', { type: 'button', class: 'aixc-btn aixc-btn--small' }, t('Save settings'))
  const forgetKeyButton = h('button', { type: 'button', class: 'aixc-btn aixc-btn--small aixc-btn--ghost' }, t('Remove key'))
  const builtInButton = h('button', { type: 'button', class: 'aixc-btn aixc-btn--small aixc-btn--ghost' }, t('Use built-in layout'))

  const settingsPanel = h(
    'details',
    { class: 'aixc-settings' },
    h('summary', null, t('Gemini settings'), keyStatus),
    h(
      'div',
      { class: 'aixc-settings__body' },
      h('label', { class: 'aixc-field', for: 'aixc-key' }, h('span', null, 'API key')),
      h('label', { class: 'aixc-field', for: 'aixc-model' }, h('span', null, t('Model')), modelInput),
      h('label', { class: 'aixc-check', for: 'aixc-remember' }, rememberInput, h('span', null, t('Remember the key in this browser'))),
      h(
        'p',
        { class: 'aixc-warning' },
        t('This prototype calls Gemini straight from your browser, so the key is readable by anyone using this page. Use a restricted test key, and never deploy this publicly without a server-side proxy.'),
      ),
      h('div', { class: 'aixc-settings__actions' }, saveKeyButton, forgetKeyButton, builtInButton),
    ),
  )
  // The key field is in the page only while these settings are open: the Voice Guide's
  // Exploration Trail never records a page that shows a password field.
  const keyLabel = settingsPanel.querySelector('label[for="aixc-key"]')
  settingsPanel.addEventListener('toggle', () => {
    if (settingsPanel.open) keyLabel.append(keyInput)
    else keyInput.remove()
  })

  const closeButton = h('button', { type: 'button', class: 'aixc-icon-btn', 'aria-label': t('Close composer') }, pathIcon(ICON_CLOSE, 'aixc-icon'))
  const form = h(
    'form',
    { class: 'aixc-composer__form', novalidate: null },
    h('label', { class: 'aixc-form-label', for: 'aixc-prompt' }, t('Or describe your own')),
    promptInput,
    h('div', { class: 'aixc-composer__actions' }, submitButton, cancelButton, progress),
    message,
  )
  const composer = h(
    'section',
    { id: 'aixc-composer', class: 'aixc-composer', 'aria-labelledby': 'aixc-composer-title', hidden: true },
    h('header', { class: 'aixc-composer__head' }, h('h2', { id: 'aixc-composer-title', class: 'aixc-composer__title' }, t('Reimagine this page')), closeButton),
    h(
      'p',
      { class: 'aixc-composer__hint', id: 'aixc-prompt-hint' },
      t('Pick an experience or describe one. The same Vodafone services, descriptions and links are recomposed; nothing is added.'),
    ),
    templatesPanel,
    form,
    settingsPanel,
  )

  /* --------------------------------------------------------------- viewbar */
  const originalButton = h('button', { type: 'button', class: 'aixc-seg', 'aria-pressed': 'true' }, t('Original'))
  const reimaginedButton = h('button', { type: 'button', class: 'aixc-seg', 'aria-pressed': 'false' }, t('Reimagined'))
  const metaLabel = h('span', { class: 'aixc-viewbar__label' })
  const metaSource = h('span', { class: 'aixc-viewbar__source' })
  const editButton = h('button', { type: 'button', class: 'aixc-btn aixc-btn--text' }, t('Change'), h('span', { class: 'aixc-wide-only' }, lang === 'ar' ? '' : '\u00a0experience'))
  const resetButton = h('button', { type: 'button', class: 'aixc-btn aixc-btn--text' }, t('Reset'))
  const viewNote = h('p', { class: 'aixc-viewnote', hidden: true })
  viewbar.append(
    h(
      'div',
      { class: 'aixc-viewbar__inner' },
      h('div', { class: 'aixc-segmented', role: 'group', 'aria-label': t('Page view') }, originalButton, reimaginedButton),
      h('p', { class: 'aixc-viewbar__meta' }, metaLabel, metaSource),
      h('div', { class: 'aixc-viewbar__actions' }, editButton, resetButton),
    ),
  )
  // The note scrolls with the page instead of living in the sticky bar.
  viewbar.after(viewNote)
  viewbar.setAttribute('aria-label', t('Page view controls'))
  viewbar.setAttribute('role', 'region')

  document.body.append(launcher, composer, liveRegion)

  /* --------------------------------------------------------- layout helpers */
  // Experiences size their stages to the space under the sticky header and view bar.
  const syncHeaderOffset = () => {
    const rootStyle = document.documentElement.style
    rootStyle.setProperty('--aixc-header-h', `${Math.round(header.getBoundingClientRect().height)}px`)
    rootStyle.setProperty('--aixc-viewbar-h', `${viewbar.hidden ? 0 : Math.round(viewbar.getBoundingClientRect().height)}px`)
  }
  syncHeaderOffset()
  if (typeof ResizeObserver === 'function') {
    const observer = new ResizeObserver(syncHeaderOffset)
    observer.observe(header)
    observer.observe(viewbar)
  }

  const updateKeyStatus = () => {
    keyStatus.textContent = settings.apiKey ? (settings.fromEnv ? t('Key from .env.local') : t('Key added')) : t('Not configured')
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
    templateButtons.forEach((button) => (button.disabled = isGenerating))
    promptInput.readOnly = isGenerating
    cancelButton.hidden = !isGenerating
    progress.hidden = !isGenerating
    composer.setAttribute('aria-busy', String(isGenerating))
    launcher.classList.toggle('is-busy', isGenerating)
  }

  /* -------------------------------------------------------------- composer */
  // The floating launcher is only needed until a transformation exists; after
  // that the view bar's "Change experience" opens the composer without covering content.
  const syncLauncher = () => {
    launcher.hidden = state.isComposerOpen || Boolean(state.lastValidSchema)
  }

  let returnFocusTo = launcher
  const openComposer = (opener = launcher) => {
    returnFocusTo = opener
    state.isComposerOpen = true
    composer.hidden = false
    warmExperiences()
    launcher.setAttribute('aria-expanded', 'true')
    syncLauncher()
    if (!hasContent) {
      showMessage(t('This page has no content that can be recomposed.'), 'error')
      submitButton.disabled = true
      templateButtons.forEach((button) => (button.disabled = true))
    }
    ;(templateButtons.find((button) => button.getAttribute('aria-pressed') === 'true') ?? templateButtons[0]).focus()
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
    // Timers and scroll listeners only run while the experience is on screen.
    if (view === 'reimagined') state.activeExperience?.mount()
    else state.activeExperience?.unmount()
    originalButton.setAttribute('aria-pressed', String(view === 'original'))
    reimaginedButton.setAttribute('aria-pressed', String(view === 'reimagined'))
    document.body.dataset.aixcView = view
    viewNote.classList.toggle('is-muted', view !== 'reimagined')

    if (focusContent && view === 'reimagined') {
      const title = outputRoot.querySelector('[data-aixc-focus], #aixc-cover-title')
      // Land the content just under the sticky site header (scrollIntoView would hide it beneath).
      const top = main.getBoundingClientRect().top + window.scrollY - header.getBoundingClientRect().height
      window.scrollTo({ top: Math.max(0, top), behavior: 'auto' })
      title?.focus({ preventScroll: true })
    } else if (focusWasInside) {
      ;(view === 'original' ? originalButton : reimaginedButton).focus()
    }
  }

  const describeSource = (meta) => {
    if (meta.source === 'template') return t('Ready-made template, no AI call')
    if (meta.source === 'built-in') return t('Built-in layout, not AI-generated')
    return t('Composed by Gemini ({model})', { model: meta.model })
  }

  const renderSchema = (result, meta) => {
    if (DEBUG) assertComplete(result.schema, index)
    const experience = renderExperience(result.schema, index, {
      onPrimitiveError: (section, error) => console.error(`[AIXC] ${section.type} "${section.id}" failed; shown as a list.`, error),
    })
    state.activeExperience?.unmount()
    outputRoot.replaceChildren(experience.element)
    state.activeExperience = experience
    if (state.view === 'reimagined') experience.mount()

    state.lastValidSchema = result.schema
    state.lastMeta = meta
    viewbar.hidden = false
    syncHeaderOffset()
    syncLauncher()
    templateButtons.forEach((button) => button.setAttribute('aria-pressed', String(meta.source === 'template' && button.dataset.template === meta.template?.id)))
    metaLabel.textContent = t(experienceLabel(result.schema.experience))
    metaSource.textContent = describeSource(meta)

    const notes = []
    if (result.schema.scope === 'filtered') {
      notes.push(t('Filtered view: {placed} of {total} items shown, as requested. Original shows everything.', { placed: result.stats.placedItems, total: result.stats.totalItems }))
    }
    if (result.stats.restoredItems > 0 && meta.source !== 'built-in') {
      const restored = result.stats.restoredItems
      notes.push(
        t(restored === 1 ? '{count} left out by the layout was added back so nothing is lost.' : '{count} left out by the layout were added back so nothing is lost.', {
          count: countItems(restored),
        }),
      )
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
      announce(t('Your reimagined layout is ready. Choose Reimagined to see it.'))
      showMessage(t('Your reimagined layout is ready. Choose Reimagined to see it.'), 'info')
      return
    }
    if (state.isComposerOpen) closeComposer({ restoreFocus: false })
    showView('reimagined', { focusContent: true })
    const extra = result.schema.unsupportedRequest
      ? ` ${t("That exact experience isn't available yet, so your request was applied as {name}.", { name: lang === 'ar' ? t(experienceLabel(result.schema.experience)) : experienceLabel(result.schema.experience).toLowerCase() })}`
      : ''
    announce(`${t('{name} ready.', { name: t(experienceLabel(result.schema.experience)) })} ${describeSource(meta)}.${extra}`)
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

  const templateResult = (template, prompt = template.prompt) => {
    const result = validateSchema(buildTemplateSchema(template, index, { prompt }), index, { prompt })
    if (!result.ok) throw new Error(`AIXC: template "${template.id}" schema is invalid: ${result.errors.join('; ')}`)
    return result
  }

  /** Renders a ready-made experience locally. Never calls Gemini. */
  const applyTemplate = (template, { prompt = template.prompt, note = '' } = {}) => {
    if (!hasContent || state.isGenerating) return
    state.activePrompt = prompt
    showMessage('')
    apply(templateResult(template, prompt), { source: 'template', template, prompt })
    if (note) {
      viewNote.textContent = note
      viewNote.hidden = false
    }
  }

  const cacheKey = (prompt) => `${fingerprint}|${settings.model}|${prompt.trim().toLowerCase().replace(/\s+/g, ' ')}`

  const failureText = (error) => {
    if (error instanceof GeminiError) return error.message
    return t('Gemini returned a layout that could not be used.')
  }

  /* ---------------------------------------------------------------- submit */
  const submit = async (rawPrompt, { forceBuiltIn = false } = {}) => {
    const prompt = rawPrompt.trim()
    if (!hasContent) {
      showMessage(t('This page has no content that can be recomposed.'), 'error')
      return
    }
    if (!prompt && !forceBuiltIn) {
      showMessage(t('Describe the presentation you want, or pick a suggestion.'), 'error')
      promptInput.focus()
      return
    }
    if (state.isGenerating) return

    state.activePrompt = prompt
    showMessage('')

    // Without a key, a prompt that names a ready-made experience still works locally.
    const matched = !settings.apiKey && !forceBuiltIn ? matchTemplate(prompt) : null
    if (matched) {
      applyTemplate(matched, {
        prompt,
        note: t('Gemini is not configured, so your prompt was matched to the ready-made {name} experience.', { name: lang === 'ar' ? t(matched.name) : matched.name.toLowerCase() }),
      })
      return
    }

    if (forceBuiltIn || !settings.apiKey) {
      apply(builtInResult(prompt), { source: 'built-in', prompt })
      if (!forceBuiltIn) {
        showMessage(t('Showing the built-in layout. Add a Gemini API key in Gemini settings to compose from your prompt.'), 'info')
        viewNote.textContent = t('Gemini is not configured, so the built-in magazine layout is shown. Add a key in Gemini settings to compose from your prompt.')
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
    announce(t('Composing your page.'))

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
        showMessage(t('Request cancelled. Your current view is unchanged.'), 'info')
        return
      }
      state.lastError = error
      console.warn('[AIXC] generation failed:', error.code ?? 'invalid-schema', error.detail ?? error.message)
      const reason = failureText(error)
      const unsupported = error.validation?.errors?.some((text) => /not available/.test(text))
      if (state.lastValidSchema) {
        showMessage(`${reason} ${t('Your current view is unchanged.')}`, 'error')
        announce(`${reason} ${t('Your current view is unchanged.')}`)
      } else {
        apply(builtInResult(prompt), { source: 'built-in', prompt })
        const note = unsupported
          ? t('That experience is not available yet, so the built-in magazine layout is shown.')
          : `${reason} ${t('Showing the built-in magazine layout instead.')}`
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
    state.activeExperience?.unmount()
    state.activeExperience = null
    outputRoot.replaceChildren()
    templateButtons.forEach((button) => button.setAttribute('aria-pressed', 'false'))
    viewbar.hidden = true
    syncHeaderOffset()
    viewNote.hidden = true
    showMessage('')
    syncLauncher()
    announce(t('Page reset to the original view.'))
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
    showMessage(settings.apiKey ? t('Gemini settings saved.') : t('Model saved. Add an API key to use Gemini.'), 'info')
  })
  forgetKeyButton.addEventListener('click', () => {
    settings.apiKey = envValue('VITE_GEMINI_API_KEY')
    settings.fromEnv = Boolean(settings.apiKey)
    settings.remember = false
    rememberInput.checked = false
    persistSettings(settings)
    updateKeyStatus()
    showMessage(t('API key removed from this browser.'), 'info')
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
    promptInput.value = state.lastMeta?.source === 'template' ? '' : state.activePrompt
    openComposer(editButton)
  })
  resetButton.addEventListener('click', reset)

  if (DEBUG) {
    window.__aixc = { state, cache, index, settings, submit, reset, showView, applyTemplate: (id) => applyTemplate(TEMPLATES.find((t) => t.id === id)), validateSchema: (raw, prompt) => validateSchema(raw, index, { prompt }) }
    console.info('[AIXC] debug mode on. window.__aixc is available.', { problems: extraction.problems })
  }

  return { state }
}
