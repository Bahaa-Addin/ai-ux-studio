# 06 Voice UI states

The microphone button and transcript bar (SPEC-02 §3).

```mermaid
stateDiagram-v2
  [*] --> idle
  idle --> unsupported: no SpeechRecognition
  unsupported --> panel: press
  idle --> permission: press, first time
  permission --> listening: granted
  permission --> error: denied
  idle --> listening: press (permission known)
  listening --> thinking: press again, or speechend + 1.2 s silence, or 15 s
  listening --> idle: Esc (cancel)
  listening --> error: no-speech, audio-capture, network
  thinking --> acting: plan received
  thinking --> error: request failed
  acting --> speaking: guide speaks
  speaking --> listening: press (barge-in, TTS cancelled ≤ 100 ms)
  speaking --> idle: speech ends
  acting --> idle: plan done, nothing to say
  error --> listening: press (try again)
  error --> panel: "Type instead"
  panel --> idle: close panel

  state listening {
    [*] --> waiting_for_words
    waiting_for_words --> words: first interim result
    words --> words: interim or final result (diff, animate new words)
  }
```

| State | Button | Halo | Bar |
|---|---|---|---|
| idle | microphone | none | hidden |
| permission | microphone | slow pulse | permission hint |
| listening | stop square | follows the voice level | words and waveform |
| thinking | three dots | none | final words, light sweep |
| acting / speaking | speaker | white ring on word boundaries | collapsed; answer bubble shows |
| error | microphone with slash | none | reason and "Type instead" |
