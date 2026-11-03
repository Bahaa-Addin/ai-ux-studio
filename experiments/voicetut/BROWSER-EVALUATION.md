# Browser speech technology evaluation — 2026-10-25

Goal: a shareable Vodafone speech experiment that generates audio on each visitor's device, avoiding a hosted inference GPU quota. Egyptian Arabic/English pronunciation and code-switching quality remain acceptance criteria.

## Findings

| Technology | Role | Fit for this experiment | VoiceTut compatibility |
| --- | --- | --- | --- |
| [WebLLM](https://webllm.mlc.ai/docs/user/basic_usage.html) | WebGPU runtime for compiled MLC language models; documented chat/text-generation APIs | Low priority for speech synthesis. Its model catalog is not a ready TTS catalog. | No VoiceTut/OmniVoice entry found in the inspected catalog. Using VoiceTut would require model/runtime work, not merely pointing WebLLM at its checkpoint. |
| [Transformers.js](https://huggingface.co/docs/transformers.js/en/index) | Higher-level model/tokenizer/pipeline library using ONNX Runtime in the browser | Good integration route for supported speech architectures. Published v4.3.1 source includes Supertonic, VITS and Chatterbox implementations. | No OmniVoice implementation was present in the inspected published source. The current VoiceTut repo has safetensors, not a ready ONNX deployment. |
| [ONNX Runtime Web](https://onnxruntime.ai/docs/tutorials/web/) | Lower-level ONNX execution with WebGPU or WebAssembly/CPU | Strong fit for an existing browser-ready TTS model and custom speech UI. Requires model-specific text preparation, inference scheduling and waveform handling. | Requires export of the model components and browser-side orchestration, including the diffusion generation loop and audio codec. The GGUF file from the CPU benchmark is not an ONNX model. |

Transformers.js and ONNX Runtime Web are layers in the same stack, not independent TTS models. Running the same model through both does not by itself establish a speed difference. GPU operator support and fallback behaviour must be checked per model; see [ONNX web execution providers](https://onnxruntime.ai/docs/tutorials/web/ep-webgpu.html).

Package metadata inspected from the npm registry: `@mlc-ai/web-llm` 0.2.86, `@huggingface/transformers` 4.3.1 and `onnxruntime-web` 1.30.0. The live demo below uses ONNX Runtime Web **1.23.0**, pinned by its own import map; it was not upgraded for this evaluation.

## Model shortlist

1. **[Supertonic 3](https://huggingface.co/Supertone/supertonic-3): first browser prototype candidate.** Arabic and English are among its 31 supported languages. The four official ONNX assets total 398,075,273 bytes (398.1 MB / 379.6 MiB), excluding voice JSONs, runtime and UI. Its official repository supplies browser inference code and its public demo is a static Space. Arabic support does not establish Egyptian-dialect or mixed-language quality. Code is MIT; model weights are OpenRAIL-M. The [official repository is archived](https://github.com/supertone-oss-archive/supertonic), and the owner states that official development/support has ended.
2. **[MMS Arabic for Transformers.js](https://huggingface.co/Xenova/mms-tts-ara): a small Arabic baseline.** Its quantized ONNX asset is 38,361,836 bytes (38.4 MB). This is an Arabic-specific voice model; English mixing and voice quality must not be assumed. Model revision inspected: `e9dd80f91dcc6fb96b590806bb15421ec6d381c4`.
3. **[Chatterbox Multilingual ONNX](https://huggingface.co/onnx-community/chatterbox-multilingual-ONNX): a heavier follow-up.** Arabic and English are documented. Its quantized language model still needs separate speech encoder/decoder and embedding assets; a small `.onnx` graph file alone is not the full download. At revision `452d3f434aa592098f1eedac9099f33642ab2da5`, no root `config.json` was present, so a drop-in Transformers.js pipeline should not be promised without an integration check. Browser performance was not tested here.

Keeping **VoiceTut itself** would be a porting project. A browser runtime does not automatically make our existing model smaller, faster or compatible. The model's Qwen-derived text backbone alone is insufficient: speech generation also needs the generation procedure and codec.

## Live browser smoke test

The official [Supertonic 3 static Space](https://huggingface.co/spaces/Supertone/supertonic-3) was operated in the Codex in-app browser on the same M1 Mac. Browser access was available for this turn. This was an upstream demo evaluation, not a change to the Vodafone page.

- Space source revision: `4402acca094e2ff2b3dff446e0bf915f3fccc462`.
- Voice: Robert / M3, the demo default, verified in the source and selected UI.
- Quality: 8 steps; speed: 1.0.
- Arabic mode for Arabic and mixed text; English mode for English text.
- Models were loaded and warmed before the measured clicks. First-download/startup latency and peak browser memory were not measured.
- The UI showed loading with WebGPU. Inspected source requests `executionProviders: ['webgpu']` when available and logs an explicit warning before whole-model WASM fallback. No such fallback warning was observed. ONNX logs did report CPU placement for some nodes, consistent with shape-operation fallback; this is not a claim that every operation ran on GPU.
- Timings below are the upstream UI's displayed processing time, not an independent profiler. They exclude model download and setup. Each text is below its 300-character chunk threshold, so a first-chunk result also covers the full sentence.

| Text case | Displayed processing time | Displayed audio duration | Displayed RTF |
| --- | ---: | ---: | ---: |
| Exact Vodafone mixed sample, first click | 1.44 s | 6.64 s | 0.217× |
| Exact Vodafone mixed sample, repeat | 2.04 s | 6.64 s | 0.307× |
| Vodafone Arabic-only sample | 1.37 s | `0:05` in the player | 0.240× |
| Vodafone English-only sample | 1.39 s | `0:04` in the player | 0.308× |

Mixed text:

> ممكن تعمل update للباقة من Ana Vodafone، وتراجع الـ balance قبل ما تعمل subscribe.

Arabic-only text:

> مع فودافون كاش، تقدر تحوّل فلوس وتدفع فواتيرك بسهولة من موبايلك.

English-only text:

> Explore Vodafone services and manage your account with the Ana Vodafone app.

This is a **different model, voice, architecture and quality-step setting** from the VoiceTut CPU benchmark. The large difference in observed latency must not be presented as a controlled WebGPU-versus-CPU or runtime-library speedup. No claim of matching VoiceTut's Egyptian accent, intelligibility, code-switching or voice similarity has been validated by listening/scoring.

The measured screenshot is saved locally at `.local-voice/browser-evaluation/supertonic-mixed-browser.jpg`. [Recorded browser results](browser-evaluation-results.json) preserve the displayed values. Inspected upstream source and asset inventory are also in that ignored folder. The demo's WAV download was attempted but its browser download event was not received; no local audio export is claimed from this check.

## Recommendation and next acceptance checks

Prototype browser speech with **Supertonic 3 through ONNX Runtime Web**, or Transformers.js after checking the same Supertonic 3 assets against its pipeline. A static HTTPS page can host the interface while inference uses each visitor's device. The static/model asset hosting still needs sufficient bandwidth, and browser storage can be evicted.

Before replacing the Vodafone speech backend:

- Listen to Arabic, English and the exact mixed sample; score Egyptian pronunciation and each embedded English term against VoiceTut.
- Measure first download, warm load, time to playable audio, full generation and repeated failures on the Mac and a representative Android/iPhone. A fast Mac result is not mobile evidence.
- Probe WebGPU capability at runtime. Evaluate the WASM path independently and show a clear unsupported/slow-device state; do not silently claim equivalent performance.
- Put inference in a worker, show download progress, cache versioned assets, expose cancellation/wait behaviour, and reuse generated section audio.
- Review the model's archived maintenance status and license as part of selecting it for wider use.

No browser benchmark was run for WebLLM, Transformers.js, WASM fallback or VoiceTut-in-browser; their assessment above is documentation/source/package feasibility review.
