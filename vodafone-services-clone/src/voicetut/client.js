// Official VoiceTut Space's Gradio call API. No SDK, keys or model download.
export const SPACE = 'https://mohammedaly22-voicetut-tts.hf.space'

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
          let message = data
          try { message = JSON.parse(data) } catch { /* Plain error text is also valid. */ }
          throw new Error(typeof message === 'string' && message ? message : 'VoiceTut could not generate audio. The hosted GPU may be busy or out of quota. Try again later or open the official demo.')
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

export async function callVoiceTut(endpoint, data, { signal } = {}) {
  if (!['info', 'synthesize'].includes(endpoint)) throw new Error('Unsupported VoiceTut endpoint.')
  const response = await fetch(`${SPACE}/gradio_api/call/${endpoint}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data }), signal,
  })
  if (!response.ok) throw new Error(`VoiceTut request failed (${response.status}). The public demo may be busy or rate-limited.`)
  const { event_id } = await response.json()
  if (typeof event_id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(event_id)) throw new Error('Invalid VoiceTut job response.')
  const events = await fetch(`${SPACE}/gradio_api/call/${endpoint}/${event_id}`, { signal })
  if (!events.ok || !events.body) throw new Error(`VoiceTut result unavailable (${events.status}).`)
  return readResult(events.body)
}

export function audioURL(file) {
  if (!file?.url) throw new Error('VoiceTut returned no audio URL.')
  const url = new URL(file.url, SPACE)
  if (url.origin !== SPACE) throw new Error('Unexpected VoiceTut audio host.')
  return url.href
}
