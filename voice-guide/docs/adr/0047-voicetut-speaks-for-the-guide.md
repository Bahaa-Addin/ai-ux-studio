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

## Built (2026-11-11, phase 1b, against a stand-in VoiceTut)

- **Service** `services/speech-out/`:
  - `voicetut.ts`, the client, with the endpoint only from `VG_VOICETUT_URL`;
  - `cache.ts`;
  - `queue.ts`, one synthesis at a time, in three lanes served in order: `now` for the page, `ahead` for a plan's own words, `warm` for the warm-up;
  - `handlers.ts`.
- **Router:** reaches the service through its client. After planning it sends `prepare` with the plan's known lines (`knownLines` in `packages/kb/src/plan.ts`: `plan.say`, and the say, confirm and ask steps) and never waits for it.
- **Gateway:**
  - `POST /v1/speech` and `GET /v1/speech/<hash>.wav?k=<site key>`; an audio element cannot send the key as a header.
  - `/v1/session` reports the effective engine: `voicetut` only when the site asks for it and `VG_VOICETUT_URL` is set.
- **Site config:** `speech.out` accepts only VoiceTut's own values (steps 16, 32 or 48; speed 0.85, 1 or 1.15).
- **Narrower than Decision 2, for AGENTS.md §4.3:** only lines known ahead are cached on disk. A sentence the page asks for without it having been prepared stays in a bounded memory cache: a value read on the page (a price), or an agent's line. Traces carry hashes, sizes and timings, never text.
- **Page:**
  - `voice-out.js` (`packages/sdk/src/voice/out.ts`, `voice-out-chunk.ts`, `voice/sentences.ts`) takes over the guide's speak, cancel and speaking.
  - Each sentence is asked at once and played in order. A later sentence that was not ready is asked again when its turn comes.
  - The browser voice speaks from the first sentence that is not ready within `firstAudioMs`, fails, cannot play (`blocked`), or would carry personal data (`private`, never sent).
- **Sizes:** `guide.js` grew by 31 bytes gzipped (the gate, measured on the Mac). `voice-out.js` is 1,969 bytes after the review fixes (2026-11-11).
- **X-ray:** "speak" rows for `speech.prepare`, `speech.synth` and `sdk.speak`, without text. The page's own report goes to the session's latest turn.
- **`npm run speech:warm`** fills the cache: fixed phrases, page titles, and the tuning sets' plans. On 2026-11-11 that came to 293 lines and 391 sentences in Arabic and English.
- **Tests:**
  - `tests/unit/speech-out.test.ts` (22) and `tests/unit/voice-out.test.ts` (17);
  - `tests/integration/speech-out.test.ts` (4, Postgres);
  - `tests/e2e/voice-out.e2e.test.ts` (3, Chromium on the saved pages): the reply is played from the page's origin; slow VoiceTut means the browser voice speaks in time; the microphone stops the audio within 100 ms;
  - the stand-in is `tests/helpers/mock-voicetut.ts`.
- **Not built:** the halo driven by the audio itself. The CSS ring shows while speaking.
- **Not verified:**
  - the real Modal endpoint (not deployed yet, O18);
  - time to first audio, warm and cold;
  - the voices (D9).
- **After the review (2026-11-11).** A three-lens adversarial review of the diff confirmed 16 findings, and a recheck of the fixes found 7 more gaps. All are fixed, with tests:
  - **Personal data:** a line counts as private only when a masking rule matches. Before, Arabic-Indic digits alone made every Arabic price private. The check also covers the line normalised (a number broken over lines) and each sentence as sent (a number that a hard cut leaves standing alone).
  - **Queue limit:** the service refuses new work for the page when 8 jobs are already waiting. The browser voice speaks, so the queue in front of the GPU cannot grow without bound.
  - **Model version:** it is re-checked against VoiceTut. A version known from an earlier run is used at once for cached lines, and checked once in the background. Any new synthesis waits for that check. The keep-warm call adopts what it hears, and `speech:warm` always asks first. So a new model rebuilds the cache, nothing is made by a mock model, and a mock model is asked again at most once a minute.
  - **New work only:** the queue limit counts new work only. A sentence already queued or being made is joined and moved up.
  - **Gateway engine:** it also says `voicetut` when a separate speech-out service is configured (`VG_SPEECH_OUT_URL`), since that service holds the endpoint.
  - **`speech:warm`** exits 1 when VoiceTut does not answer.
  - **No redirects:** neither the Gradio calls nor the audio download follow redirects, so the reply text goes to the configured host only.
  - **Audio size:** the download is read in pieces and cut off past 8 MB, with or without a length header.
  - **Audio player:** each play owns its settle, so a late rejection from an earlier play cannot end the next one.
  - **Voice UI:** `speaking` stays true while a line waits for its next sentence's audio, so the UI does not drop to idle mid-reply.
  - **One service:** with `VG_SPEECH_OUT_URL`, every process uses the one speech-out (`node services/run-service.ts speechOut`), so VoiceTut sees a single queue.
  - **Test suites:** the existing Vodafone suites pin `VG_VOICETUT_URL` to empty.
- **Known limit:** a synthesis the page asked for (not made ahead) is traced without a turn id, so its `speech.synth` row is not in the X-ray. The page's own `sdk.speak` row for that line is there.

## Amended 2026-11-12: the service checks for personal data itself

The independent review of phases 1 to 2 found that the page's masking rules were the only gate before a line went to VoiceTut, and that they missed a mobile number written in groups ("010 1234 5678", "+20 10 1234 5678"; bug log B-32). The rules now cover those forms, and the speech-out service applies the same rules to every line it is asked for: `speak` answers `private` and sends nothing, `prepare` leaves the line out. So a caller that is not `voice-out.js` (a demo chunk reading a section aloud, a tool) cannot send personal data either. Tests: `tests/unit/safety.test.ts`, `tests/unit/speech-out.test.ts`.

Still open from the same review (Plane AIXC-34 to AIXC-39, AIXC-49): this ADR's address of the Modal endpoint in its Context, the `voicetut` engine in the one site config, the line before a navigation, the audio download's budget, the chunk not awaited on a resumed plan, keep-warm's interval, and tests for no-redirects and keep-warm.

