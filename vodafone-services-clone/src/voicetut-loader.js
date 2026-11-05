/**
 * VoiceTut experiment, off unless asked for: ?demo=voicetut. Reads a section aloud with a hosted
 * Egyptian Arabic + English speech model (experiments/voicetut/README.md). Only the text a person
 * submits is sent, to the public Hugging Face demo or the endpoint entered in the panel; nothing is
 * sent on load except a request for the voice list. The page never loads it by itself.
 */
const params = new URL(location.href).searchParams

if (params.get('demo') === 'voicetut') {
  const css = document.createElement('link')
  css.rel = 'stylesheet'
  css.href = new URL('./voicetut/demo.css', import.meta.url).href
  document.head.append(css)
  try {
    await import('./voicetut/demo.js')
  } catch (error) {
    console.warn('[voicetut] could not start', error)
  }
}
