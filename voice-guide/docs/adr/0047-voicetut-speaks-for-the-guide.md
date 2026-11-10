# ADR-0047: VoiceTut speaks the guide's replies, through the gateway, with the browser voice as the fallback

- Status: Accepted as the direction (owner, 2026-11-10); the design below is proposed and lands in phase 1b of `docs/handoff/live-demos-way2.md` (repository root). For the owner's demos only until the model licence is cleared (as ADR-0042 is for the agent model).
- Date: 2026-11-10
- Area: speech output, privacy, demo; follows the VoiceTut port of 2026-11-05 (`experiments/voicetut/`, `vodafone-services-clone/src/voicetut/`, open issue O18)
- Owner decision: 2026-11-10, "I also resolved Modal's billing issue and the plan should implement VoiceTut in the voice guide text-to-speech feedback"

## Context

The guide speaks every reply with the browser's own voice: `Speech.speak()` in `packages/sdk/src/speech.ts` uses `speechSynthesis` with the site's language tags (`ar-EG`, `en-US`, `config/sites/vodafone-eg.yaml` `speech.tts`). On the demo Mac that is whatever Arabic system voice macOS has, which does not sound Egyptian and stumbles on mixed Arabic and English ("الـ balance").

VoiceTut is an Egyptian Arabic and English text-to-speech model (fine-tuned from OmniVoice). It was ported on 2026-11-05 as a separate panel on the Services clone (`?demo=voicetut`), talking to a Gradio API with two calls, `info` (voices, model version, sampling rate) and `synthesize` (text and settings in, a WAV file out). The owner's Modal deployment (`experiments/voicetut/modal_app.py`: one L4 GPU, `min_containers=0`, `max_containers=1`, `scaledown_window=60`, endpoint `https://elbalashonyb-vodafone--vodafone-voicetut.modal.run`) was blocked on billing. Measured before: 19 voices at 24 kHz; on the author's hosted GPU a 2.8-second clip took 1.7 s of model time and 3.0 s of total processing, before network and queue; the first call after a scale-down can take minutes.

On 2026-11-10 at 10:08 UTC, after the owner fixed billing, `POST /gradio_api/call/info` on that endpoint still answered `404 modal-http: invalid function call`: the app needs to be deployed again.

Constraints:

- `guide.js` has 79 bytes of its 20,480-byte budget left (ADR-0041).
- Replies are spoken around navigations: `#say(text, { wait })` waits at most 2.5 s before a `navigate` step, and the answer is often spoken on the next page, a new document. The demo browser already runs Chrome with `--autoplay-policy=no-user-gesture-required`.
- Some lines carry live values read in the browser (a price), so not every line is known on the server.
- Egypt's data protection law gates sending users' **voice** abroad. Text-to-speech sends only the guide's own reply text, never the person's audio or words, but it still leaves the country (Modal) and must be said.
- OmniVoice's pretrained weights are CC-BY-NC: non-commercial use only.

## Decision

1. **The gateway calls VoiceTut, not the page.** A new speech-out service (`services/speech-out/`, a handler map like the others, ADR-0009) owns the VoiceTut client: the Gradio `info` and `synthesize` calls, ported to TypeScript from `vodafone-services-clone/src/voicetut/client.js`. The page asks `POST /v1/speech` (through `/__vg/`, same origin) with `{ text, lang }` and gets `{ url, engine, cached, ms }`; the audio is served from `/v1/speech/<hash>.wav`. The VoiceTut endpoint stays out of the page and out of the repository (`VG_VOICETUT_URL`).
2. **Synthesise ahead and cache.** When the planner makes a plan, the service starts synthesising its known lines (`plan.say` and step texts) at once, so audio is usually ready when the page needs it, on this page or the next. Audio is cached on disk by a hash of engine, model version, voice, language, settings and text (`data/speech/`, git-ignored). `npm run speech:warm` synthesises the guide's fixed phrases (`packages/sdk/src/i18n.ts`) and the router tuning set's answers before a demo.
3. **First sentence first.** Long replies are split into sentences; the first is synthesised and played first, the rest follow in order, so the wait is for one sentence, not the whole reply.
4. **The browser voice stays as the fallback.** If VoiceTut has not returned the first sentence within a budget (2.5 s to start with), or fails, that line is spoken by `speechSynthesis` as today, and the audio is still cached for next time. A reply is never silent because of VoiceTut.
5. **Playback lives in an on-demand chunk** (`voice-out.js`), loaded at session start when the site's engine is `voicetut`: an `HTMLAudioElement` with the same contract as `Speech.speak()` (resolves when spoken, `cancelSpeech()` stops it at once when the person presses the microphone). The system-voice code moves into the same chunk if `guide.js` needs the bytes.
6. **Settings are site config**, under `speech.out` in `config/sites/vodafone-eg.yaml`: `engine` (`voicetut` or `system`), the voice per language (start with "Mohammed"; compare "Yasmin"), VoiceTut's language mode per language (`arz` for Arabic and mixed, `en` for English), steps, speed, number normalisation, the first-audio budget.
7. **Keep it warm while it is used.** While a demo session is active, the service calls `info` every 45 s so Modal does not scale down between replies; it stops when no session is active. Before an audience, `npm run speech:warm` both wakes the GPU and fills the cache.
8. **Say what leaves.** Only the guide's reply text goes to VoiceTut, never the person's audio, transcript or anything typed. The X-ray's turn shows a "speak" row: engine, cache hit, synthesis time, time to first audio, fallback reason.

## Consequences

- The guide sounds Egyptian and handles mixed Arabic and English, in the owner's demos.
- A reply can start later than with the system voice when it is not cached. Synthesis ahead, the cache and sentence splitting are there to keep that rare; the budget and fallback bound it.
- Modal GPU time costs money while warm. The keep-warm loop runs only with an active session; `scaledown_window` and the spending limit stay the owner's knobs on Modal.
- The VoiceTut panel and "Read this section" on the clone retire with the clone (ADR-0046 phase 9). Reading a section aloud can come back as a guide command later, through the same service.
- Customers: not until the licence is cleared and the text-to-speech host is acceptable under Egyptian data rules. Until then `speech.out.engine` is `system` everywhere but the demo profile.

## Pilot knobs

- `speech.out.voice`, `speech.out.mode`, `steps` (16 is faster, 32 balanced), `speed`, `normalize`, `firstAudioMs` (2500), per language.
- Keep-warm interval (45 s) and whether it runs.
- Modal: `scaledown_window` (60 s), `min_containers` (0), `max_containers` (1), the spending limit.
- Which lines are synthesised ahead (all known lines, or `plan.say` only).

## Revisit when

- Time to first audio for uncached replies stays above the budget in the pilot (switch the default to cached lines only, or a smaller model).
- The licence or the data rules change, or a host in Egypt becomes available.
- A browser-side model (the Supertonic 3 evaluation in `experiments/voicetut/BROWSER-EVALUATION.md`) becomes good enough to drop the network call.
