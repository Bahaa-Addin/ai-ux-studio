# ADR-0019: Use the browser's Web Speech API for listening and speaking, with Egyptian Arabic and English tags per site, and a typing box always available

- Status: Accepted (demo slice). Changes the demo plan, which drew a server-side speech service.
- Date: 2026-10-23
- Area: Speech
- Code: `packages/sdk/src/speech.ts`; site config `speech.stt`, `speech.tts`

## Context

The demo needs Arabic (Egyptian) and English recognition and speech, started from a button on the page. Streaming speech services exist but need an account, a key per site, audio streaming through our gateway, and a data-processing review for voice. Chrome and Edge ship speech recognition (`SpeechRecognition`, network-backed in Chrome) and speech synthesis with Arabic and English voices.

## Decision

1. **Listen:** `SpeechRecognition` with the site's tag per language (`ar-EG`, `en-US`), interim results shown live, the final result sent as the request. One utterance per press.
2. **Speak:** `speechSynthesis` with a voice matching the tag when the device has one. The SDK never waits longer than the line takes (with a cap), and speaking never blocks the plan except briefly before a page change.
3. **Fallbacks:** if recognition is missing or the microphone is denied, the panel says so and focuses the typing box. Everything the guide says is also written in the panel, so the guide works muted and is accessible.
4. **No audio reaches our servers.** Only the transcript (text) is sent.
5. **Language** of each request is detected from its words (ADR-0014); listening uses the page's language, and the reply follows the request.

## Options considered

| Option | Outcome |
|---|---|
| Cloud streaming speech (Azure, Google, Whisper) through the gateway | Deferred: better dialect accuracy and custom vocabulary, but needs keys, audio streaming and a voice-data review. The SDK's `Speech` class is the seam to swap. |
| On-device recognition only | Not available for Arabic in browsers today. |

## Consequences

- Recognition quality depends on the browser and its vendor's service; Safari and Firefox support is partial. The demo laptop runs Chrome.
- Chrome's recognition sends audio to Google's service. That is the browser's processing, not ours, but the pilot privacy notice must say so.
- Product and offer names in Arabic may be misheard; the router's trigram matching and the lexicon absorb part of this. The rest is measured in rehearsal (`sdk.listen` events carry the transcript and confidence).
- Voices sound different per device; a branded voice needs a TTS service.

## Pilot knobs

| Knob | Default | Effect |
|---|---|---|
| `speech.stt` (site) | `{ ar: ar-EG, en: en-US }` | Recognition language per page language. |
| `speech.tts` (site) | `{ ar: ar-EG, en: en-US }` | Voice language. |
| Mute button | off | Per person, in the panel. |

## Revisit when

- Rehearsal transcripts show more than 1 in 10 requests misheard in Arabic: trial a cloud recognizer with a phrase list built from the knowledge base labels.
- A branded voice is required: add a TTS service behind the gateway with cached audio for fixed lines.

## Verified by

- `tests/e2e/guide.e2e.test.ts`: a request "spoken" through the `SpeechRecognition` interface (a stand-in at the browser API boundary) starts with `ar-EG` on an Arabic page and runs the whole flow; spoken lines are captured from `speechSynthesis`.
