import { callVoiceTut, audioURL } from './client.js'

const samples = {
  mixed: 'ممكن تعمل update للباقة من Ana Vodafone، وتراجع الـ balance قبل ما تعمل subscribe.',
  arabic: 'مع فودافون كاش، تقدر تحوّل فلوس وتدفع فواتيرك بسهولة من موبايلك.',
  english: 'Explore Vodafone services and manage your account with the Ana Vodafone app.',
}

const panel = document.createElement('details')
panel.className = 'voicetut-demo'
panel.open = true
panel.innerHTML = `<summary>VoiceTut · تجربة الصوت</summary>
  <form>
    <p>Egyptian Arabic + English. Generated speech from the author's hosted demo.</p>
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
    <small>Only text you submit is sent to the public Hugging Face demo. Its GPU queue and usage limits apply.
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
const player = find('audio')
const link = find('#vt-open-audio')
let active = null
let ready = false
let selection = ''
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
  status.textContent = 'Connecting to the hosted VoiceTut model…'
  const timeout = setTimeout(() => active?.abort('timeout'), 60000)
  try {
    const [info] = await callVoiceTut('info', [], { signal: active.signal })
    if (info.mock || !Array.isArray(info.speakers) || !info.speakers.length) throw new Error('The hosted demo is not serving real VoiceTut voices.')
    voice.replaceChildren(...info.speakers.map(speaker => {
      const option = document.createElement('option')
      option.value = speaker.speaker_name
      option.textContent = `${speaker.speaker_name} · ${speaker.arabic_name}`
      return option
    }))
    if (info.speakers.some(speaker => speaker.speaker_name === 'Mohammed')) voice.value = 'Mohammed'
    ready = true
    status.textContent = `Ready · ${info.speakers.length} voices · VoiceTut ${info.model_version} · ${info.sampling_rate / 1000} kHz`
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
find('form').addEventListener('submit', async event => {
  event.preventDefault()
  if (active || !ready || !text.value.trim()) return
  const input = text.value.trim()
  const speaker = voice.value
  const data = [input, language.value, 'builtin', speaker, null, '', Number(find('#vt-steps').value), 2.0, Number(find('#vt-speed').value), find('#vt-normalize').checked]
  active = new AbortController()
  busy(true)
  player.pause()
  player.removeAttribute('src')
  player.load()
  player.hidden = true
  link.hidden = true
  status.textContent = 'Waiting for VoiceTut’s GPU… generation may take a few minutes.'
  const started = performance.now()
  const timeout = setTimeout(() => active?.abort('timeout'), 240000)
  try {
    const [file, metrics] = await callVoiceTut('synthesize', data, { signal: active.signal })
    const url = audioURL(file)
    player.src = url
    player.hidden = false
    link.href = url
    link.hidden = false
    status.textContent = `${speaker} · ${Number(metrics.audio).toFixed(1)}s audio · ${((performance.now() - started) / 1000).toFixed(1)}s including queue. Press Play to listen.`
  } catch (error) {
    status.textContent = active.signal.aborted
      ? 'Stopped waiting. The hosted job may still finish and use GPU quota. You can try again.'
      : `Generation failed: ${error.message}`
  } finally {
    clearTimeout(timeout)
    active = null
    busy(false)
  }
})
player.addEventListener('error', () => {
  if (player.hasAttribute('src')) status.textContent = 'The generated audio could not load. Try the WAV link or generate again.'
})
void connect()
