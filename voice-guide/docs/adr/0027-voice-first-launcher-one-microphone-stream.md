# ADR-0027: Voice-first launcher: the floating button is a microphone, one microphone stream feeds recognition and the waveform, and the transcript lives in a small black bar

- Status: Proposed (Vodafone live phase). Accept when SPEC-02 acceptance criteria 1–10 pass.
- Date: 2026-10-23
- Area: Speech and UI; amends ADR-0019 (speech in the browser) and ADR-0020 (UI in shadow DOM)
- Spec: [SPEC-02](../specs/SPEC-02-voice-first-ui.md)

## Context

The demo build opens a panel when the floating button is pressed, and listening is a second press. The brief is voice first:
- the floating button looks like a microphone;
- pressing it listens at once;
- the words appear in a small black bar above it, word by word in real time;
- a live, responsive wave shows the voice being heard.

Vodafone already has a floating button on its CMS pages: the accessibility widget, a 55px red circle with a white ring and a red glow, bottom-right on every page (audit §5).

A live waveform needs the microphone signal. Web Speech recognition normally opens the microphone itself, and a second capture for the waveform can conflict on some devices. The current spec and MDN document `SpeechRecognition.start(audioTrack)`, which lets recognition use a track we already have.

## Decision

1. **The launcher is the microphone.** One press starts listening; the panel moves behind a small keyboard button next to it. Everything else (panel, bubble, spotlight, X-ray) stays and is restyled with Vodafone tokens.
2. **Same visual family as Vodafone's floating button**: red fill, 5px white ring, red glow, 64px. It sits **above** the accessibility button on the same vertical axis and never covers or replaces it. Same coordinates on every page.
3. **One microphone stream** feeds an `AnalyserNode` (waveform and halo) and recognition (`start(track)`). Fall back to two captures, then to event-driven animation, and record which mode ran (`sdk.stt.mode`).
4. **The transcript bar shows words one by one**: diff the recogniser's interim and final text into word spans; animate only new words; replace revised words in place; stagger words that arrive together.
5. **Waveform on canvas**: three layered curves in Vodafone red and white, driven by level and three frequency bands, 60fps only while listening, and a static meter under reduced motion.

## Options considered

| Option | Outcome |
|---|---|
| Keep the panel as the first surface | Rejected: not voice first. |
| Replace Vodafone's accessibility button with the microphone | Rejected: it is an accessibility feature. Folding the guide into the widget's menu is an option for Vodafone's team later. |
| Waveform from recognition events only | Kept as the last fallback; not "real, responsive" when the microphone signal is available. |
| Server-side streaming recognition (our own WebSocket) | Not now: needs a speech provider contract and audio leaving the browser to us. Revisit for dialect accuracy (below). |
| CSS-only animation (pulsing rings) | Rejected: does not respond to the voice. |

## Consequences

- One more browser API surface (Web Audio) in the SDK; about 3–4 KB gzipped.
- On Chrome the default recognition engine sends audio to a web service; `processLocally` is used where available (`speech.onDevice`). Data protection must sign off (PRD open question Q3).
- The visual result is testable with Chromium's fake microphone and a WAV file (SPEC-02 acceptance 5).

## Pilot knobs

| Knob | Where | Default |
|---|---|---|
| `speech.onDevice` | site config | `prefer` |
| `speech.stt`, `speech.tts` | site config | `ar-EG`, `en-US` |
| `ui.mic.offsetAboveAccessibility` | site config (new) | 16px |
| End-of-speech silence | `ui.mic.endSilenceMs` (new) | 1,200ms |
| Max utterance | `ui.mic.maxMs` (new) | 15,000ms |

## Revisit when

- `sdk.stt.mode = events-only` on more than 10% of sessions: fix the capture conflict on those devices or move to server streaming.
- Egyptian Arabic word error rate on the evaluation recordings is above 15%: evaluate a server-side streaming provider with Egyptian Arabic support.
- Vodafone wants the guide inside the accessibility widget: the microphone becomes a widget entry; the bar stays.

## Verified by (planned)

- `tests/e2e/voice-ui.e2e.test.ts`: SPEC-02 acceptance 1–10 with Chromium's fake microphone.
