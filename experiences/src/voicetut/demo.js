import { callVoiceTut, audioURL, SPACE, voiceTutBase, isVoiceTutLoopback } from './client.js'
import { vodafoneServicesPage } from '../content/vodafone-services.js'
import { mountSectionReaders } from './sections.js'

const samples = {
  mixed: 'ممكن تعمل update للباقة من Ana Vodafone، وتراجع الـ balance قبل ما تعمل subscribe.',
  arabic: 'مع فودافون كاش، تقدر تحوّل فلوس وتدفع فواتيرك بسهولة من موبايلك.',
  english: 'Explore Vodafone services and manage your account with the Ana Vodafone app.',
}

const panel = document.createElement('details')
panel.className = 'voicetut-demo'
// Starts as a small tab in the bottom-left corner, clear of the guide and the Pocket (2026-11-05).
panel.open = false
// Typed text and controls are never part of a recorded journey (Exploration Trail, ADR-0037).
panel.dataset.vg = ''
panel.innerHTML = `<summary>VoiceTut · تجربة الصوت</summary>
  <form>
    <p>Egyptian Arabic + English, powered by VoiceTut: the public Hugging Face demo, or the endpoint you enter.</p>
    <label for="vt-endpoint">VoiceTut endpoint / عنوان الخدمة</label>
    <input id="vt-endpoint" type="url" inputmode="url" autocomplete="url" placeholder="VoiceTut service URL">
    <small>The cloud voice starts when needed. The first connection after inactivity can take a few minutes. Monthly usage limits apply.</small>
    <label for="vt-text">Text to read / النص</label>
    <textarea id="vt-text" dir="auto" required maxlength="1500" rows="4"></textarea>
    <div class="vt-presets" aria-label="Sample copy">
      <button type="button" data-sample="mixed">عربي + English</button>
      <button type="button" data-sample="arabic">عربي</button>
      <button type="button" data-sample="english">English</button>
      <button type="button" id="vt-selection" disabled>Use selected page text</button>
    </div>
    <div class="vt-row">
      <label>Voice / الصوت<select id="vt-voice" disabled><option>Loading voices…</option></select></label>
      <label>Language<select id="vt-language"><option value="arz">Egyptian / mixed</option><option value="en">English</option></select></label>
    </div>
    <small>“Read this section” uses these settings. Choose English for the page’s English copy; the language setting does not translate it.</small>
    <div class="vt-row">
      <label>Speed<select id="vt-speed"><option value="0.85">0.85×</option><option value="1" selected>1×</option><option value="1.15">1.15×</option></select></label>
      <label>Generation steps<select id="vt-steps"><option value="16">16 · faster</option><option value="32" selected>32 · balanced</option><option value="48">48 · more steps</option></select></label>
    </div>
    <label class="vt-check"><input id="vt-normalize" type="checkbox"> Normalize numbers and abbreviations</label>
    <small>Off initially so you can hear the English terms as written. Sample copy is for pronunciation testing.</small>
    <div class="vt-actions">
      <button id="vt-generate" type="submit" disabled>Generate speech</button>
      <button id="vt-cancel" type="button" disabled>Cancel wait</button>
      <button id="vt-connect" type="button">Reconnect</button>
    </div>
    <output id="vt-status" role="status" aria-live="polite">Connecting to VoiceTut…</output>
    <audio controls preload="none" hidden aria-label="VoiceTut generated speech"></audio>
    <a id="vt-open-audio" hidden target="_blank" rel="noopener">Open generated WAV</a>
    <small id="vt-data-note">Only the text you submit is sent to the selected VoiceTut service on Modal.
      <a href="https://huggingface.co/spaces/mohammedaly22/VoiceTut-TTS" target="_blank" rel="noopener">Official demo</a></small>
  </form>`
document.body.append(panel)
const find = selector => panel.querySelector(selector)
const text = find('#vt-text')
const voice = find('#vt-voice')
const language = find('#vt-language')
const generate = find('#vt-generate')
const cancel = find('#vt-cancel')
const reconnect = find('#vt-connect')
const status = find('#vt-status')
const endpoint = find('#vt-endpoint')
// Blank means the author's public Hugging Face Space (owner's choice, 2026-11-05: the Modal
// deployment is not live). Paste the Modal URL here once it is.
endpoint.value = ''
const player = find('audio')
const link = find('#vt-open-audio')
let active = null
let ready = false
let currentBase = SPACE
let selection = ''
let sectionReaders = []
let sectionAudio = null
text.value = samples.mixed

document.addEventListener('selectionchange', () => {
  const selected = window.getSelection()
  if (!selected?.isCollapsed && selected.anchorNode && !panel.contains(selected.anchorNode)) {
    selection = selected.toString().trim().slice(0, 1500)
    find('#vt-selection').disabled = !selection
  }
})
find('#vt-selection').addEventListener('click', () => { text.value = selection; text.focus() })
for (const button of panel.querySelectorAll('[data-sample]')) {
  button.addEventListener('click', () => {
    text.value = samples[button.dataset.sample]
    language.value = button.dataset.sample === 'english' ? 'en' : 'arz'
  })
}
function busy(value) {
  for (const control of panel.querySelectorAll('input, textarea, select, button')) control.disabled = value
  for (const reader of sectionReaders) reader.button.disabled = value
  cancel.disabled = !value
  if (!value) {
    voice.disabled = !ready
    generate.disabled = !ready
    find('#vt-selection').disabled = !selection
  }
}
cancel.addEventListener('click', () => active?.abort())

async function connect() {
  if (active) return
  active = new AbortController()
  busy(true)
  status.textContent = 'Connecting to VoiceTut… The cloud voice may need a few minutes to wake up.'
  const timeout = setTimeout(() => active?.abort('timeout'), 300000)
  try {
    const base = voiceTutBase(endpoint.value)
    const [info] = await callVoiceTut('info', [], { signal: active.signal, base })
    if (info.mock || !Array.isArray(info.speakers) || !info.speakers.length) throw new Error('The selected endpoint is not serving real VoiceTut voices.')
    voice.replaceChildren(...info.speakers.map(speaker => {
      const option = document.createElement('option')
      option.value = speaker.speaker_name
      option.textContent = `${speaker.speaker_name} · ${speaker.arabic_name}`
      return option
    }))
    if (info.speakers.some(speaker => speaker.speaker_name === 'Mohammed')) voice.value = 'Mohammed'
    currentBase = base
    ready = true
    find('#vt-data-note').firstChild.textContent = isVoiceTutLoopback(base)
      ? 'The text you submit is sent to the VoiceTut process running on this computer. '
      : base === SPACE
        ? 'Only the text you submit is sent to the public Hugging Face demo. Its GPU queue and usage limits apply. '
        : 'Only the text you submit is sent to the selected hosted endpoint. Monthly usage limits apply; the voice starts when needed. '
    status.textContent = `Ready · ${info.speakers.length} voices · ${info.model_version} · ${info.sampling_rate / 1000} kHz`
  } catch (error) {
    ready = false
    status.textContent = active.signal.aborted ? 'Connection stopped or timed out. Select Reconnect to try again.' : `Could not connect: ${error.message}`
  } finally {
    clearTimeout(timeout)
    active = null
    busy(false)
  }
}
reconnect.addEventListener('click', connect)

function speechData(input) {
  return [input, language.value, 'builtin', voice.value, null, '', Number(find('#vt-steps').value), 2.0, Number(find('#vt-speed').value), find('#vt-normalize').checked]
}

async function playSection() {
  try {
    await player.play()
  } catch {
    if (sectionAudio) sectionAudio.reader.setState('Play section', 'Audio is ready. Press Play section or use the panel’s audio player.')
  }
}

async function readSection(reader) {
  if (active) return
  if (!ready) {
    reader.setState('Read this section', 'Connect VoiceTut in the speech panel first.')
    panel.open = true
    endpoint.focus()
    return
  }
  const requestKey = JSON.stringify([currentBase, speechData(reader.text)])
  if (sectionAudio?.reader === reader && sectionAudio.requestKey === requestKey && player.hasAttribute('src')) {
    if (player.paused) {
      if (player.ended) player.currentTime = 0
      await playSection()
    } else player.pause()
    return
  }
  text.value = reader.text
  await generateSpeech(reader, requestKey)
}

async function generateSpeech(reader = null, requestKey = null) {
  if (active || !ready || !text.value.trim()) return
  const input = text.value.trim()
  if (input.length > text.maxLength) {
    panel.open = true
    status.textContent = `This section exceeds ${text.maxLength} characters. Shorten the text in the speech panel before generating.`
    reader?.setState('Read this section', 'This section is too long. Shorten it in the speech panel.')
    text.focus()
    return
  }
  const speaker = voice.value
  const data = speechData(input)
  active = new AbortController()
  busy(true)
  player.pause()
  sectionAudio?.reader.setState()
  sectionAudio = null
  reader?.setState('Generating…', `Preparing ${reader.title} with ${speaker}.`)
  player.removeAttribute('src')
  player.load()
  player.hidden = true
  link.hidden = true
  status.textContent = isVoiceTutLoopback(currentBase)
    ? 'Generating speech on this computer… this may take a minute or more.'
    : 'Waiting for VoiceTut’s GPU… generation may take a few minutes.'
  const started = performance.now()
  const timeout = setTimeout(() => active?.abort('timeout'), 240000)
  try {
    const [file, metrics] = await callVoiceTut('synthesize', data, { signal: active.signal, base: currentBase })
    const url = audioURL(file, currentBase)
    player.src = url
    player.hidden = false
    link.href = url
    link.hidden = false
    status.textContent = `${speaker} · ${Number(metrics.audio).toFixed(1)}s audio · ${((performance.now() - started) / 1000).toFixed(1)}s including queue. Press Play to listen.`
    if (reader) {
      sectionAudio = { reader, requestKey, speaker }
      reader.setState('Play section', `Ready · ${speaker}.`)
      await playSection()
    }
  } catch (error) {
    status.textContent = active.signal.aborted
      ? isVoiceTutLoopback(currentBase)
        ? 'Stopped waiting. The generation already running on this computer may still finish.'
        : 'Stopped waiting. The hosted job may still finish and use GPU quota. You can try again.'
      : `Generation failed: ${error.message}`
    reader?.setState('Read this section', status.textContent)
  } finally {
    clearTimeout(timeout)
    active = null
    busy(false)
  }
}

find('form').addEventListener('submit', event => {
  event.preventDefault()
  void generateSpeech()
})
player.addEventListener('play', () => {
  if (sectionAudio) sectionAudio.reader.setState('Pause reading', `Reading with ${sectionAudio.speaker}.`)
})
player.addEventListener('pause', () => {
  if (sectionAudio && !player.ended) sectionAudio.reader.setState('Resume reading', `Paused · ${sectionAudio.speaker}.`)
})
player.addEventListener('ended', () => {
  if (sectionAudio) sectionAudio.reader.setState('Read again', `Finished · ${sectionAudio.speaker}.`)
})
player.addEventListener('error', () => {
  if (player.hasAttribute('src')) {
    status.textContent = 'The generated audio could not load. Try the WAV link or generate again.'
    sectionAudio?.reader.setState('Read this section', status.textContent)
    sectionAudio = null
  }
})

function installSectionReaders() {
  sectionReaders = mountSectionReaders(document.querySelector('#source-content'), vodafoneServicesPage.sections, readSection)
  for (const reader of sectionReaders) reader.button.disabled = Boolean(active)
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installSectionReaders, { once: true })
else installSectionReaders()
void connect()
