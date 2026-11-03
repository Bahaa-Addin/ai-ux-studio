// Official VoiceTut Space's Gradio call API. No SDK, keys or model download.
export const SPACE = 'https://mohammedaly22-voicetut-tts.hf.space'
export const MODAL_ENDPOINT = 'https://elbalashonyb-vodafone--vodafone-voicetut.modal.run'

export function voiceTutBase(value = '') {
  const raw = value.trim()
  if (!raw) return SPACE
  let url
  try { url = new URL(raw) } catch { throw new Error('Enter a valid VoiceTut HTTPS endpoint or a local loopback URL.') }
  const loopback = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(url.hostname.toLowerCase())
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('Use an HTTPS VoiceTut endpoint, or HTTP on localhost only, without a path or credentials.')
  }
  return url.origin
}

export function isVoiceTutLoopback(value) {
  const url = new URL(voiceTutBase(value))
  return url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]', '::1'].includes(url.hostname.toLowerCase())
}

export function parseEvent(block) {
  const lines = block.replace(/\r/g, '').split('\n')
  const event = lines.find(line => line.startsWith('event:'))?.slice(6).trim()
  const data = lines.filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n')
  return { event, data }
}

export async function readResult(body) {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let pending = ''
  try {
    while (true) {
      const { value, done } = await reader.read()
      pending += decoder.decode(value, { stream: !done }).replace(/\r/g, '')
      let boundary
      while ((boundary = pending.indexOf('\n\n')) !== -1) {
        const { event, data } = parseEvent(pending.slice(0, boundary))
        pending = pending.slice(boundary + 2)
        if (event === 'error') {
          let message = data.trim()
          try {
            const detail = JSON.parse(data)
            if (typeof detail === 'string') message = detail
            else if (detail && typeof detail === 'object') {
              const candidate = detail.message ?? detail.error ?? detail.detail
              message = typeof candidate === 'string'
                ? candidate
                : typeof candidate?.message === 'string' ? candidate.message : ''
            } else message = ''
          } catch { /* Plain error text is also valid. */ }
          throw new Error(message.slice(0, 400) || 'VoiceTut returned an error without details. Try again or check the selected endpoint.')
        }
        if (event === 'complete') return JSON.parse(data)
      }
      if (done) throw new Error('VoiceTut closed the connection before returning a result. Please retry.')
    }
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}

export async function callVoiceTut(endpoint, data, { signal, base = SPACE } = {}) {
  if (!['info', 'synthesize'].includes(endpoint)) throw new Error('Unsupported VoiceTut endpoint.')
  const origin = voiceTutBase(base)
  const response = await fetch(`${origin}/gradio_api/call/${endpoint}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data }), signal,
  })
  if (!response.ok) throw new Error(`VoiceTut request failed (${response.status}). The service may be starting, unavailable, or at its usage limit. Try Reconnect.`)
  const { event_id } = await response.json()
  if (typeof event_id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(event_id)) throw new Error('Invalid VoiceTut job response.')
  const events = await fetch(`${origin}/gradio_api/call/${endpoint}/${event_id}`, { signal })
  if (!events.ok || !events.body) throw new Error(`VoiceTut result unavailable (${events.status}).`)
  return readResult(events.body)
}

export function audioURL(file, base = SPACE) {
  if (!file?.url) throw new Error('VoiceTut returned no audio URL.')
  const origin = voiceTutBase(base)
  const url = new URL(file.url, `${origin}/`)
  if (url.origin !== origin) throw new Error('Unexpected VoiceTut audio host.')
  return url.href
}
