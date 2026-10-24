# VoiceTut × Vodafone Services

Runs on `experiment/text-to-speech` alongside the earlier unchanged Chrome extension. No extension is needed for this new panel.

## Try it

```sh
cd vodafone-services-clone
node scripts/serve.mjs --port 5181
```

Open http://127.0.0.1:5181/. The **VoiceTut · تجربة الصوت** panel connects to the author's official hosted demo and loads its voices.

1. Start with **Mohammed**, **Egyptian / mixed**, 32 steps, 1× speed.
2. Use the mixed sample: `ممكن تعمل update للباقة من Ana Vodafone، وتراجع الـ balance قبل ما تعمل subscribe.`
3. Click **Generate speech**, wait for the GPU result, then press **Play**.
4. Compare **Yasmin** or another voice with the same text. Try Arabic-only and English-only presets; those also select the appropriate language mode.
5. Select text on the Vodafone page, then choose **Use selected page text**. This copies at most 1,500 characters into the editable input; nothing is sent until Generate is pressed. Select English mode for English-only page copy.
6. Compare normalization on/off, especially for numbers, abbreviations and embedded English terms. Normalization is off initially. The sample is pronunciation-test copy, not a translation of the page or a verified service instruction.

Use the native audio controls for playback, pause and scrubbing. **Cancel wait** abandons the local request; it does not promise to cancel the remote GPU job or refund quota. Changing text or generating again clears the previous result. The panel can be collapsed using its title.

## Integration

- Engine: [VoiceTut-TTS](https://huggingface.co/mohammedaly22/VoiceTut-TTS), fine-tuned from OmniVoice. Its model card declares Apache-2.0; the earlier unrelated Chrome extension retains GPL-3.0.
- Backend: author's [official Space](https://huggingface.co/spaces/mohammedaly22/VoiceTut-TTS), via its published Gradio `/info` and `/synthesize` endpoints. No custom voice cloning or uploaded reference recordings.
- Frontend: native browser fetch + streaming result parser, no added packages, secrets, server proxy or local model download.
- `src/voicetut/client.js`: API calls, streamed job events, errors, and audio URL validation.
- `src/voicetut/demo.js` / `demo.css`: panel, voices, test presets, selected-text capture, playback, timeouts and request cancellation.
- The client verifies the service is not in mock mode and reads its live speaker list. Public hosting can change or disappear; this is not a pinned model deployment.
- Info timeout: 60 seconds. Generation timeout: 4 minutes. Public GPU queues and quotas apply. Errors remain visible; there is no fallback to browser voices or simulated audio.
- Text is sent to the public Space only when generation is requested. `/info` sends no page text. Only the generated audio URL is loaded into the player; audio is not committed to the repository.

## Local GPU option

The official model card's installation requires a suitable PyTorch build plus OmniVoice from GitHub and `voicetut-tts`. Its published benchmarks use an NVIDIA T4; they are not measurements for this Apple Silicon machine. This experiment uses hosted inference and does not install those packages or download model weights.

For a separate CUDA machine, follow the current [official setup](https://huggingface.co/mohammedaly22/VoiceTut-TTS#installation), then the documented Python API:

```python
from voicetut_tts import VoiceTutTTS

tts = VoiceTutTTS.from_pretrained("mohammedaly22/VoiceTut-TTS")
tts.synthesize("ممكن تعمل update للباقة من Ana Vodafone.",
               speaker="Mohammed", output="vodafone-mixed.wav")
```

## Validation

- Official hosted engine reported `mock: false`, model version `v1`, package `0.2.0`, 19 voices, 24 kHz.
- Direct live generation produced a 2.8-second WAV for a short Arabic–English sentence. The backend reported 1.719 seconds model generation and 3.042 seconds total processing; these numbers exclude client/network queue overhead.
- Unit checks cover chunked result parsing, hosted error/quota responses, incomplete streams and output-host validation, alongside the existing page tests.
- End-to-end browser check: the panel loaded all 19 voices, generated the mixed Vodafone preset with Mohammed, and played the returned WAV (5.72 seconds, no media error). Browser console had no errors. All 23 unit tests passed.
- Speech naturalness, pronunciation of Vodafone/product names and code-switching quality should be judged by listening; successful WAV generation alone does not establish superiority over other engines.
