# SPEC-02: Voice-first UI: microphone button, live transcript bar, live waveform

- Status: Ready to build
- Requirement: PRD R4 (voice first; a microphone floating button; a small black bar above it with the transcript word by word in real time; a live, responsive wave animation)
- Decision: [ADR-0027](../adr/0027-voice-first-launcher-one-microphone-stream.md)
- Design tokens: [SPEC-01](SPEC-01-vodafone-design-language.md)
- Diagram: [voice UI states](../diagrams/06-voice-ui-states.md)
- Code today: `packages/sdk/src/ui.ts` (launcher, panel), `packages/sdk/src/speech.ts` (Web Speech wrapper)

## 1. What changes and what stays

| Part | Change |
|---|---|
| Floating launcher | **Redesigned** as the microphone button. One press starts listening; it no longer opens the panel. |
| Transcript bar | **New.** A small black bar above the microphone: live words plus the waveform. |
| Waveform | **New.** Driven by the real microphone signal. |
| Panel, answer bubble, spotlight, pointer, page-watch toasts, X-ray | **Kept as they are**, restyled with Vodafone tokens (SPEC-01). The panel is opened from a small keyboard button next to the microphone. |
| Plans, routing, agent, sessions | Unchanged. |

## 2. Layout

All positions are physical (they do not mirror in RTL), because Vodafone's own floating button stays bottom-right on Arabic pages (audit §5).

```
                                    ┌──────────────────────────────────┐
                                    │ ∿∿∿∿  إيه أرخص باقة نت؟▍          │  ← transcript bar (black, 6px radius)
                                    └──────────────────────────────────┘    bottom 167px, right 16px
                                   12px
                              ⌨     ( 🎤 )   ← microphone, 64px incl. 5px white ring
                             40px              bottom 91px, centre 47.5px from the right edge
                                   16px
                                    ( ♿ )   ← Vodafone accessibility button, 55px (theirs, untouched)
                                               bottom 20px, right 20px
```

| Element | Size | Position (desktop and mobile) |
|---|---|---|
| Microphone | 64 × 64 px including the 5px white ring | `right: calc(15.5px + env(safe-area-inset-right))`, `bottom: calc(91px + env(safe-area-inset-bottom))`. Its centre is on the accessibility button's vertical axis. |
| Keyboard button | 40 × 40 px | Left of the microphone, vertically centred on it, 12px gap (`right: 91.5px`, `bottom: 103px`) |
| Transcript bar | height 48px (one line) or 70px (two lines); width fits the words from 220px up to `min(440px, 100vw − 32px)` | `right: 16px`, `bottom: 167px`; grows to the left |

- **The same coordinates on every page**, including `/spa/` pages and the shop where the accessibility button is absent, so nothing jumps as the person moves around the site.
- `z-index: var(--vf-z)` (2147483000): above the page, below OneTrust's banner and filter (2147483645). If OneTrust's banner is open, the guide still works but must not cover it; the banner sits bottom-left, so there is no overlap at widths ≥ 420px. Below 420px, the transcript bar's bottom moves above the banner's top edge (measure `#onetrust-banner-sdk` and add 12px).
- Never covers the accessibility button: an end-to-end assertion checks the rectangles do not intersect on `/en/home` and `/ar/home` at 375, 768 and 1280px widths.

## 3. Microphone button

### Look (from the Vodafone accessibility button)

- Fill `--vf-red`, `border: var(--vf-ring)` (5px white), `border-radius: 50%`, `box-shadow: var(--vf-shadow-fab)`.
- Glyph: white microphone, 28px, 2px strokes with rounded caps (the current `ICONS.mic` path is acceptable).
- Hover: `translateY(-2px)` and a stronger glow `0 8px 24px rgba(230,0,0,.45)`, 140ms.
- Pressed: `scale(.96)`.
- Focus visible: `outline: 3px solid var(--vf-aqua); outline-offset: 3px`.

### States

| State | Glyph | Around the button | Bar |
|---|---|---|---|
| `idle` | microphone | nothing | hidden |
| `permission` (first press, browser prompt open) | microphone | slow 1.6s pulse ring | "Allow the microphone to talk to me" / "اسمح للميكروفون علشان نتكلم" |
| `listening` | stop square (press to finish) | **audio-reactive halo**: a red disc behind the button, `scale = 1 + 0.35 × level`, `opacity = 0.25 + 0.35 × level`, where `level` is the smoothed microphone level (§5) | live words + waveform |
| `thinking` (final words sent, waiting for the plan) | three white dots, 900ms loop | none | words stay; a light sweep moves across the bar once every 900ms |
| `speaking` (guide's voice playing) | speaker glyph | thin white ring pulsing with speech boundary events | collapses; the answer bubble takes over |
| `error` | microphone with a slash | none | short reason and a "Type instead" link |
| `unsupported` (no speech recognition) | keyboard glyph | none | none; pressing opens the panel |

The `aria-pressed` attribute is `true` in `listening`. The `aria-label` follows the state ("Talk to the Vodafone guide" / "اتكلم مع مساعد ڤودافون", "Stop listening" / "وقف الاستماع").

### Interaction

| Input | Effect |
|---|---|
| Click, tap, Enter or Space | `idle` → start listening; `listening` → stop and send; `speaking` → stop speaking and start listening (barge-in) |
| Press and hold ≥ 450ms (touch) | Push to talk: listens while held, sends on release |
| Esc while listening | Cancel: discard words, back to `idle` |
| Silence | Ends on its own: after the engine's `speechend` plus 1.2s with no new words, or 15s in total |
| Keyboard button | Opens the existing panel (typing, history, chips), unchanged |

The keyboard button shows on hover or focus of the microphone, while listening, and in `error`. It is always in the tab order right after the microphone.

## 4. Transcript bar (the "small black bar")

### Look

- Background `--vf-black-bar` (black at 90%), `backdrop-filter: blur(8px)` where supported, `border-radius: var(--vf-radius)`, `box-shadow: var(--vf-shadow-float)`.
- Padding 10px 14px; contents in one row: **waveform** (72 × 28px canvas) at the inline start, then the **words**.
- Words: 16px / 22px, Vodafone regular face for the language being heard, white. `dir="auto"` so Arabic reads right to left inside the bar.
- At most two lines. Older words scroll up under a 12px fade mask at the top; the newest word is always visible.
- A small language chip at the inline end ("ع" / "EN") switches the recognition language for the next utterance. It defaults to the page language (`/ar/` → `ar-EG`, `/en/` → `en-US`), whatever the page's `lang` attribute says (audit §6).

### Word by word, in real time

Speech engines send phrases and revise them. The bar must still **read like words arriving one at a time**:

1. On every `result` event build `finalText` (all results with `isFinal`) and `interimText` (the rest).
2. Tokenise both by whitespace (works for Arabic and English). Displayed tokens = final tokens followed by interim tokens.
3. Compare with what is on screen:
   - shared prefix: untouched (no flicker);
   - changed tokens: cross-fade the text in place (opacity 1 → 0 → 1 over 120ms);
   - new tokens: appended as `<span class="w">` elements that **enter one by one**, `opacity 0 → 1` and `translateY(6px) → 0` over 140ms with `--vf-ease`. When several arrive in one event, stagger them by 45ms so they still appear word by word.
4. Interim words at 70% opacity; they become 100% when final.
5. A caret (`▍`, 1s blink) follows the last word while listening.
6. Render at most once per animation frame (batch events with `requestAnimationFrame`).
7. Before the first word: "Listening…" / "سامعك…" in 70% white.

Timing targets (measured, see §8): a word is on screen within **50ms of the `result` event** that contains it. The engine's own delay (speech start → first interim word) is typically 300–800ms; it is recorded, not promised.

### After the person stops

- The final transcript stays at 100% for the `thinking` state.
- When the plan starts (first step runs) the bar collapses (`scaleY` and `opacity` to 0 over 180ms) and the existing answer bubble and spotlight take over.
- On error the bar shows the reason in one short line, for example "I didn't catch that. Try again" / "مسمعتكش كويس، جرّب تاني", plus "Type instead".

## 5. Waveform and level

### One microphone stream for everything (ADR-0027)

1. `getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })` once per listening session.
2. `AudioContext` → `MediaStreamAudioSourceNode` → `AnalyserNode` (`fftSize = 1024`, `smoothingTimeConstant = 0.6`). The analyser is not connected to the speakers.
3. Recognition uses **the same track**: `recognition.start(track)`. The `audioTrack` parameter is in the current Web Speech spec and on MDN; feature-detect it by calling with the track inside `try`, and on `TypeError` call `start()` without it.
4. If the browser cannot run recognition and our capture at the same time (some Android builds report `audio-capture` errors), stop our stream and drive the animation from recognition events instead (`soundstart`, `speechstart`, `result`), with a synthetic level. Record the mode as `sdk.stt.mode` = `shared-track` | `two-captures` | `events-only`.
5. On stop, end the tracks and close the `AudioContext` straight away so the browser's recording indicator turns off.

### Level

- Every frame: RMS of `getFloatTimeDomainData`, mapped through a soft knee to 0–1 (`level = min(1, (rms / 0.12) ** 0.7)`).
- Smoothing: attack 40ms, release 180ms (exponential), so speech peaks feel instant and the decay feels natural.
- The same `level` drives the microphone halo (§3) and the waveform.

### Drawing (canvas 2D, device-pixel-ratio aware)

- Three layered sine curves across the 72 × 28px canvas:
  - back: `rgba(230,0,0,.45)`, frequency 1.2, amplitude from the low band (≈ 80–300 Hz)
  - middle: `#e60000`, frequency 1.8, amplitude from the mid band (≈ 300–1,500 Hz)
  - front: `#ffffff`, frequency 2.6, amplitude from the high band (≈ 1.5–4 kHz), 1.5px line
- Each curve: `y = A · sin(2π · f · x / width + phase) · envelope(x)`, where `envelope` tapers to 0 at both ends (a Hann window) and `phase` advances by `0.12 + 0.25 · level` per frame. Band energy comes from `getByteFrequencyData`.
- Silence: a flat white line with a 1px idle ripple, so the bar never looks frozen.
- 60fps with `requestAnimationFrame`; the loop runs only while listening. Budget: < 1ms of scripting per frame on a mid-range laptop (`performance.measure` around the draw).
- `prefers-reduced-motion: reduce`: no moving curves; show five vertical bars whose heights step with the level (no easing), and no halo scaling.

## 6. Recognition settings

| Setting | Value |
|---|---|
| `lang` | `ar-EG` or `en-US` (language chip) |
| `interimResults` | `true` (required for word by word) |
| `continuous` | `false` for a single request; the bar handles end of speech |
| `maxAlternatives` | 1 |
| `phrases` (contextual biasing, where supported) | Product names from the knowledge base lexicon: Vodafone Flex, RED, Vodafone Plus, Plus Apps, Vodafone Cash, Ana Vodafone, El-Kart, Shokran, and their Arabic spellings. Feature-detect. |
| `processLocally` | Site config `speech.onDevice: prefer | require | off` (new, default `prefer`). With `prefer`, check `SpeechRecognition.available()` for the language; use local recognition when available, else the browser's server engine. **Privacy note:** in Chrome the default engine sends audio to a web service (MDN). Vodafone's data protection owner decides whether that is acceptable (PRD open question). |

## 7. Accessibility

- Microphone and keyboard buttons are real `<button>`s, at least 40px. The guide's host element is appended at the end of `<body>`, so they come after the page's own content in the tab order; a skip shortcut (Alt+Shift+V) focuses the microphone from anywhere.
- Screen readers: the bar's live words are `aria-hidden` (interim updates would flood the reader). A visually hidden `role="status"` region announces only the **final** transcript and the guide's reply.
- Never steals focus while the person is typing in a page field.
- Works with the accessibility widget's settings: if the widget enlarges text (it rewrites `data-wf-font-size` attributes), the guide reads the root font size on each open and scales its own type by the same ratio, up to 1.5×.
- Contrast: white on the black bar ≥ 17:1; white on red 4.81:1.

## 8. Telemetry (trace events)

| Event | Attributes |
|---|---|
| `sdk.mic.press` | state before |
| `sdk.mic.permission` | `granted` | `denied` | `prompt`, ms |
| `sdk.stt.mode` | `shared-track` | `two-captures` | `events-only`, `onDevice` |
| `sdk.stt.first_word` | ms from `speechstart` to the first displayed word |
| `sdk.stt.render` | p95 ms from `result` event to the word on screen (per utterance) |
| `sdk.stt.final` | ms from `speechend` to the final transcript, word count, language |
| `sdk.stt.error` | engine error code |
| `sdk.wave.frame` | p95 draw ms per utterance |

The X-ray shows `first_word`, `final` and `mode` for each turn.

## 9. Acceptance criteria

1. **Look:** the microphone's computed fill, ring and shadow equal SPEC-01 tokens; screenshots in `idle`, `listening`, `thinking`, `error` for English and Arabic match the references.
2. **Placement:** on `/en/home` and `/ar/home` at 375, 768 and 1280px, the microphone and the bar never intersect the accessibility button or the OneTrust banner; the microphone keeps the same coordinates on `/spa/storeLocator`.
3. **Word by word:** with the speech stand-in emitting interim results `إيه` → `إيه أرخص` → `إيه أرخص باقة` → final `إيه أرخص باقة نت`, the bar's DOM gains one `.w` span per new word, in order, each with an entry animation; no span is removed and re-added for the unchanged prefix.
4. **Revision:** interim `what's the cheap` → `what's the cheapest` replaces only the last word in place.
5. **Live waveform:** in Chromium started with a fake microphone playing a WAV file (`--use-fake-device-for-media-stream --use-file-for-fake-audio-capture=tests/fixtures/audio/ar-cheapest.wav`), the canvas changes between frames, the halo's scale varies by more than 0.1 over the utterance, and both return to rest within 300ms of the audio ending.
6. **Reduced motion:** with `prefers-reduced-motion: reduce`, no curve animation runs and the halo does not scale.
7. **Latency:** `sdk.stt.render` p95 ≤ 50ms; `sdk.wave.frame` p95 ≤ 1ms (desktop Chromium in CI).
8. **Release:** after stop, no `MediaStreamTrack` is `live` and the `AudioContext` is closed (checked in the test).
9. **Fallbacks:** permission denied → `error` state with "Type instead" opening the panel; no speech recognition → `unsupported` state opens the panel on press.
10. **Barge-in:** pressing during `speaking` cancels speech synthesis within 100ms and starts listening.
