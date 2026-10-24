import test from 'node:test'
import assert from 'node:assert/strict'
import { readResult, audioURL, SPACE } from '../src/voicetut/client.js'

function stream(parts) {
  return new ReadableStream({ start(controller) {
    const encoder = new TextEncoder()
    for (const part of parts) controller.enqueue(encoder.encode(part))
    controller.close()
  } })
}

test('VoiceTut parses heartbeat and a completed result split across network chunks', async () => {
  const result = await readResult(stream(['event: heartbeat\r\ndata: null\r\n\r\nevent: com', 'plete\ndata: [{"text":"أهلاً"}', ', {"audio":2.5}]\n\n']))
  assert.deepEqual(result, [{ text: 'أهلاً' }, { audio: 2.5 }])
})
test('VoiceTut surfaces quota errors instead of treating them as audio', async () => {
  await assert.rejects(readResult(stream(['event: error\ndata: "GPU quota exceeded"\n\n'])), /GPU quota exceeded/)
  await assert.rejects(readResult(stream(['event: error\ndata: null\n\n'])), /busy or out of quota/)
})
test('VoiceTut reports an interrupted result stream', async () => {
  await assert.rejects(readResult(stream(['event: heartbeat\ndata: null\n\n'])), /before returning a result/)
})
test('VoiceTut audio URLs stay on the official host', () => {
  assert.equal(audioURL({ url: '/gradio_api/file=test.wav' }), `${SPACE}/gradio_api/file=test.wav`)
  assert.throws(() => audioURL({ url: 'https://example.com/a.wav' }), /Unexpected/)
  assert.throws(() => audioURL({ path: '/tmp/a.wav' }), /no audio URL/)
})
