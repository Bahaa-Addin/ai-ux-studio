# ADR-0055: Whisper on Modal listens for browsers without speech recognition

- Status: Proposed (built 2026-11-13 against a stand-in; accepted after a live run on Firefox)
- Date: 2026-11-13
- Area: speech input, privacy, cost; extends ADR-0019 and ADR-0033
- Owner decision: 2026-11-13, first "typing only", then the same day: "Use Whisper on Modal as a fallback"

## Context

Firefox has no `SpeechRecognition`; some Chromium builds (Brave without Google's keys) fail with `network`. The guide already falls back to typing (ADR-0033 §2). The public demo should keep voice there.

## Decision

1. **Server speech-to-text** through the gateway: `POST /v1/stt?session=&lang=&ms=` with the clip as recorded (Opus in webm, ogg or mp4), to Whisper (`large-v3-turbo`, faster-whisper) on Modal (`deploy/whisper/modal_app.py`: one L4 per container, `MAX_CONTAINERS` 2, scale to zero after 120 s, bearer token from a Modal secret). The gateway checks the site key and origin, the session, the type and size (`VG_STT_MAX_BYTES`, 512 KB), a per-session rate (`VG_STT_PER_SESSION_PER_HOUR`, 40) and the site's seconds per day (`VG_STT_SECONDS_PER_DAY`, 4 h). The session says `speech.server: true` when it is configured (`VG_WHISPER_URL`).
2. **In the page**, an on-demand chunk (`stt.js`) gives the guide's `Speech` a second listener with the same contract: it records the guide's own microphone track and ends a clip on a 1.2 s pause after speech, a second press, or 15 s; silence sends nothing. It is loaded when the browser has no recognition, or after recognition fails with `network` (then the next press uses it). **Everything about the fallback lives in `stt.js`, not `guide.js`**, to keep the main script within its budget (T-504; 21 KB since ADR-0057): the routing between the browser's recognition and the gateway (`routeSpeech` in `packages/sdk/src/voice/stt-ui.ts` wraps the guide's `Speech` once the chunk loads), the notice below, the switch after `network`, the "busy" message, and their English and Arabic strings. `guide.js` keeps two hooks: before a press (`stt.gate`) and on a listening failure (`stt.failed`, which loads the chunk first when the gateway has speech-to-text).
3. **Said before the first clip.** The first press shows, in the transcript bar: "To understand you, your voice is sent to our speech-to-text service outside Egypt, then deleted", with "OK, continue". Agreeing is remembered in `localStorage` (`vg-stt-notice:<site key>`, kept by the storage keeper, ADR-0053).
4. **Never kept**: the Modal app holds the clip in memory for one request and logs nothing; the gateway's trace records the clip's size and length and the text's length, never the words or the audio.

## Consequences

- People's voice leaves Egypt (Modal's US region). The owner chose this for the public demo; it needs the data-protection decision (PRD D2) before any Vodafone-run pilot, as Chrome's own service already does with Google.
- Cold starts: the first clip after scale-down waits for a GPU (tens of seconds). Keep `min_containers=0` for cost; raise it for a scheduled session.
- No interim words in Firefox: the transcript appears when the clip comes back.

## Pilot knobs

`VG_WHISPER_URL`, `VG_WHISPER_TOKEN`, `VG_WHISPER_TIMEOUT_MS` (20 s), `VG_STT_MAX_SECONDS` (15), `VG_STT_MAX_BYTES`, `VG_STT_PER_SESSION_PER_HOUR`, `VG_STT_SECONDS_PER_DAY`; Modal `MAX_CONTAINERS`, `SCALEDOWN`; the pause (`QUIET_MS`, 1.2 s) and speech level (`SPEECH_LEVEL`) in `packages/sdk/src/voice/server-listen.ts`.

## Revisit when

An Egyptian Arabic model beats Whisper on the router's voice set; Firefox ships recognition; the data-protection decision says voice must stay in Egypt (then host the model in-country or go back to typing).
