# VoiceTut × Vodafone Services

**Migration status (2026-10-26):** Modal image built successfully, but GPU deployment is blocked until a payment method is added. The page is configured for the intended Modal URL; that API is not live or verified yet. Local model downloads and the inference environment have been removed at the user's request; benchmark evidence and recordings are retained. Before retrying deployment, verify credits and set a $0 out-of-pocket spending limit.

Runs on `experiment/text-to-speech` alongside the earlier unchanged Chrome extension. No extension is needed for this new panel.

## Try it

```sh
cd vodafone-services-clone
node scripts/serve.mjs --port 5181
```

Open http://127.0.0.1:5181/. The **VoiceTut · تجربة الصوت** panel is configured to connect to the Modal service by default (activation pending; see status above). No local speech model is required. The first connection after inactivity can take a few minutes while the GPU and model start.

The endpoint is `https://elbalashonyb-vodafone--vodafone-voicetut.modal.run`. Clear the field and select **Reconnect** only if you want to use the author's official hosted demo instead.

1. Start with **Mohammed**, **Egyptian / mixed**, 32 steps, 1× speed.
2. Use the mixed sample: `ممكن تعمل update للباقة من Ana Vodafone، وتراجع الـ balance قبل ما تعمل subscribe.`
3. Click **Generate speech**, wait for the GPU result, then press **Play**.
4. Compare **Yasmin** or another voice with the same text. Try Arabic-only and English-only presets; those also select the appropriate language mode.
5. Select text on the Vodafone page, then choose **Use selected page text**. This copies at most 1,500 characters into the editable input; nothing is sent until Generate is pressed. Select English mode for English-only page copy.
6. Compare normalization on/off, especially for numbers, abbreviations and embedded English terms. Normalization is off initially. The sample is pronunciation-test copy, not a translation of the page or a verified service instruction.

## Read a page section

Each of the six service sections has a **Read this section** button beside its heading. Choose a voice, language, speed, generation steps and normalization setting in the panel, then select a section button. It copies that section's heading, service names and descriptions into the speech panel and generates with those settings. CTA labels, URLs, navigation and speech controls are excluded. Choose **English** for the page's existing English copy; selecting Egyptian / mixed changes speech mode and does not translate the page.

The section shows generation status while all reading/generation controls are disabled. The resulting audio attempts to play automatically. If the browser requires another gesture, select **Play section** or use the panel's audio player. The section button becomes **Pause reading**, **Resume reading**, then **Read again** when finished. Replaying the last section with unchanged settings reuses its audio; changing the voice or another generation setting creates new speech.

**Cancel wait** restores the controls, but inference already running may continue. Connection and generation errors appear beside the requested section and in the panel. If disconnected, a section button opens the panel and asks you to reconnect without submitting section text. All six current sections fit the 1,500-character limit in full; longer future sections require shortening in the panel.

Use the native audio controls for playback, pause and scrubbing. **Cancel wait** stops the page from waiting for a result; a model call already running may continue on the selected machine or use hosted GPU quota. Changing text or generating again clears the previous result. The panel can be collapsed using its title.

## Integration

- Engine: [VoiceTut-TTS](https://huggingface.co/mohammedaly22/VoiceTut-TTS), fine-tuned from OmniVoice. VoiceTut's card declares Apache-2.0, while the [OmniVoice card](https://huggingface.co/k2-fsa/OmniVoice) says its pretrained weights are CC-BY-NC; clarify those upstream terms before commercial use. The earlier unrelated Chrome extension retains GPL-3.0.
- Backend: the Modal Gradio API by default, the author's [official Space](https://huggingface.co/spaces/mohammedaly22/VoiceTut-TTS) when the endpoint is blank, or the temporary Kaggle Gradio endpoint, through `/info` and `/synthesize`. No custom voice cloning or uploaded reference recordings.
- Frontend: native browser fetch + streaming result parser, no added packages or secrets. HTTP is accepted only for loopback hostnames; hosted endpoints still require HTTPS.
- `src/voicetut/client.js`: API calls, streamed job events, errors, endpoint validation, and same-endpoint audio URL validation.
- `src/voicetut/demo.js` / `demo.css`: panel, voices, test presets, selected-text capture, playback, timeouts and request cancellation.
- `src/voicetut/sections.js`: section-only speech text and accessible reading controls, mounted onto the existing service sections.
- The client verifies the service is not in mock mode and reads its live speaker list. Public hosting can change or disappear; this is not a pinned model deployment.
- Info timeout: 60 seconds. Generation timeout: 4 minutes. Public GPU queues and quotas apply. Errors remain visible; there is no fallback to browser voices or simulated audio.
- Text is sent to the selected endpoint only when generation is requested. With the loopback endpoint, text and generated WAV remain on this computer. `/info` sends no page text. Audio files and model cache are Git-ignored.

## Historical local Mac API

The previous local setup stored its model, audio tokenizer, Python environment, and generated WAVs in the ignored `.local-voice/` directory. The large downloads and environment were removed on 2026-10-26; the commands below are historical and require reinstalling dependencies and downloading the model again. The first download needs internet; subsequent launches use the cache. The API loads checkpoint weights on CPU, then moves the main model to Apple Metal (MPS); the audio tokenizer remains on CPU. It binds to `127.0.0.1:7860`, `share=False`, and queues one generation at a time.

From this experiment root, start it with:

```sh
HF_HOME="$PWD/.local-voice/hf" \
HF_HUB_CACHE="$PWD/.local-voice/hf/hub" \
TOKENIZERS_PARALLELISM=false \
.local-voice/venv/bin/python experiments/voicetut/local_api.py
```

Keep that terminal process running while using the page. Stop it with Ctrl-C. The cached snapshot is pinned to `b36bdf4`; see [the model card](https://huggingface.co/mohammedaly22/VoiceTut-TTS) for upstream setup and model terms. The author's published performance benchmarks use an NVIDIA T4 and do not predict Apple Silicon speed.

## Smaller model on CPU

See the [Q8 CPU benchmark](CPU-BENCHMARK.md) and [measured-results JSON](cpu-benchmark-results.json). With the standalone audio.cpp Q8 package on two M1 CPU threads, subsequent requests took 158.1 seconds (16 steps) and 175.3 seconds (32 steps) for 5.88 seconds of mixed Arabic-English speech. Peak observed resident memory across the runs was 1.64 GiB. These local measurements suggest caching fixed page audio for a small free CPU host; target-VM performance still needs measuring. The Vodafone panel now defaults to Modal; this remains historical local CPU evidence.

## Validation

For a runtime comparison and an initial live browser speech check, see the [browser technology evaluation](BROWSER-EVALUATION.md). Supertonic 3 through ONNX Runtime Web is a separate model candidate; it has not replaced the Vodafone page's VoiceTut backend.

- Official hosted engine reported `mock: false`, model version `v1`, package `0.2.0`, 19 voices, 24 kHz.
- Direct live generation produced a 2.8-second WAV for a short Arabic–English sentence. The backend reported 1.719 seconds model generation and 3.042 seconds total processing; these numbers exclude client/network queue overhead.
- Unit checks cover chunked result parsing, hosted error/quota responses, incomplete streams and output-host validation, alongside the existing page tests.
- End-to-end browser check: the panel loaded all 19 voices, generated the mixed Vodafone preset with Mohammed, and played the returned WAV (5.72 seconds, no media error). Browser console had no errors. All 23 unit tests passed.
- Local M1 smoke test: the pinned 19-voice snapshot loaded on CPU and moved to MPS; the Vodafone page connected to `127.0.0.1:7860` and generated a 5.69-second mixed Arabic-English WAV in 48.4 seconds (51.7 seconds including the page queue). The result appeared in the page player. Listening quality still needs a human comparison.
- Restart check: the saved API script started on `127.0.0.1:7860`, reported MPS for the model and CPU for the audio tokenizer, returned all 19 voices, and generated a 1.21-second mixed sample in 17.02 seconds at 16 steps. The returned file had a valid RIFF/WAVE header. Browser control was disabled in Work settings before the final restart check; this final request was verified directly through the local API.
- Section interactions: all 25 repository tests passed, including selected-section text and full-description/length checks. A temporary LinkeDOM check using the real page renderer and speech panel with a stub API verified all six buttons, selected voice/language/speed/steps, no duplicate requests while generating, autoplay/pause/resume/replay, regeneration on voice changes, cancellation, error recovery and disconnected behavior. This check did not run GPU inference. The page served the new module and the local API responded; visual browser verification was unavailable because local browser use was disabled in Work settings.
- Speech naturalness, pronunciation of Vodafone/product names and code-switching quality should be judged by listening; successful WAV generation alone does not establish superiority over other engines.


## Modal deployment

`modal_app.py` builds an image containing pinned VoiceTut and audio-tokenizer snapshots downloaded directly from Hugging Face. It packages `local_api.py`, which selects CUDA on Modal and retains MPS as an optional local mode. No local model weights, credentials, or unrelated repository files are uploaded.

- NVIDIA L4, 2 CPU cores requested, 8 GiB host RAM.
- Zero minimum containers, maximum one GPU container, 60-second idle shutdown.
- One synthesis at a time, queue limited to two; built-in voices only, text up to 1,500 characters, validated steps/speed/guidance.
- Stable public Gradio API with the existing `info` and `synthesize` contract. Anyone with the URL can consume the workspace allowance. Cancellation only cancels waiting; running inference may continue.
- Generated WAVs are temporary container files. Download any recordings you want to retain. No persistent paid volume is provisioned.
- The workspace showed $1 included credits and a $1 Modal-set usage limit without a payment method on 2026-10-26. This account state takes precedence over the generic advertised $30 Starter allowance. No payment method or paid plan was added.

Deploy using the official Modal client after authorizing the intended workspace:

```sh
modal deploy experiments/voicetut/modal_app.py
```

The desktop deployment client and its 7-day credential were kept outside Git in `/private/tmp/vodafone-modal-client` and `/private/tmp/vodafone-modal.toml`. These are temporary; authenticate again after expiry/removal. Browser code contains no Modal credential.


### Migration verification

The cloud build completed for image `im-jbvk9m7ediLD54NGkWlQmE`, including both pinned HF snapshots. Deploying app `ap-grJ0BcFBd1mqXwBomoUfwp` then returned: `Please add a payment method to use L4 GPU functions.` The app is stopped with zero tasks; no inference was run. All 25 frontend tests and the production build passed. Live inference and page playback remain pending payment-method setup and a $0 spending limit.

See `local-cleanup-results.json` for the exact removed paths and allocated bytes released. Only experiment-owned downloads were removed, not shared package caches, project dependencies, source code, or other branches.
