# VoiceTut Q8 CPU benchmark — 2026-10-25

This is a local hardware measurement for assessing a small free VM, not a deployment or a measurement of Oracle's hardware.

## Setup

- Host: Apple M1, 8 CPU cores (4 performance + 4 efficiency), 16 GiB RAM, macOS arm64.
- Runtime: official audio.cpp release `v0.9.2-drama3-base-small`, macOS ARM64 binary.
- Inference backend: `cpu`, two threads. `VECLIB_MAXIMUM_THREADS`, `OMP_NUM_THREADS` and `OPENBLAS_NUM_THREADS` were also set to 2.
- Model: `mohammedaly22/VoiceTut-TTS-GGUF`, revision `615457bb2e9043f468e012c159146b28fa8f5959`, file `voicetut-tts-q8_0.gguf`, 1,350,264,224 bytes (1.258 GiB).
- Model SHA-256: `995a1fc8973cf376b490231aa107bd22ab1f5da003e89d11ada48f6d5058f67a`.
- Runtime archive SHA-256: `1281998c1acd170a7d92139853fe6ce6ab920e211d2ad3359775d43ad9ba616d`.
- Voice: the same packaged Mohammed reference used by the existing local Python demo, 7.808 seconds at 24 kHz. Reference SHA-256: `eb34272def6285cd7ed6cb112af39a7146f0cacf366a5e8bf9ae5c406d986f9b`.
- Egyptian Arabic (`arz`), guidance 2.0, speed 1.0, normalization off, fixed seeds 42 (warm-up) and 43 (measured request).
- A dedicated server bound to `127.0.0.1:7861` kept the model loaded between requests. Requests ran serially. Timing covers localhost request through complete WAV response, excluding model loading.
- Startup and peak resident memory were measured separately. Peak RSS comes from `resource.getrusage(RUSAGE_CHILDREN)` after the dedicated native server exits; macOS reports bytes.

Text is the same 82-character mixed sample used by the Vodafone panel:

> ممكن تعمل update للباقة من Ana Vodafone، وتراجع الـ balance قبل ما تعمل subscribe.

The binary discovers Metal while initializing available backends. Inference was explicitly configured as CPU, and both generator and audio-tokenizer weight buffers were reported as `CPU` in runtime logs.

## Results

| Setting | First generation / warm-up | Subsequent generation | Audio length | Subsequent generation / audio length |
| --- | ---: | ---: | ---: | ---: |
| CPU, 2 threads, 16 steps | 116.752 s | 158.119 s | 5.88 s | 26.891× |
| CPU, 2 threads, 32 steps | 188.972 s | 175.345 s | 5.82–5.88 s | 29.821× |

The 16-step process loaded in 11.014 seconds and peaked at 1.638 GiB resident memory. Its extra repetitions were stopped once a warm measurement was obtained; completed results were preserved. The 32-step configuration ran in a fresh process, loaded in 19.859 seconds, and peaked at 1.124 GiB resident memory. Both dedicated servers were stopped after measurement.

This is one warm-up and one completed measured request per setting, not a statistically stable median. The desktop was not isolated from other applications; the warm-up/repeat variation is substantial. Two threads on this M1 do not emulate two Oracle Ampere cores. Peak RSS is an observed macOS process metric, not a guaranteed deployment memory budget. The binary's declared generator and tokenizer CPU weight buffers total approximately 1,225.7 MiB; mapped/compressed memory and RSS accounting differ.

All four completed responses were 24 kHz WAVs with finite, non-silent samples. Pronunciation, intelligibility and voice similarity have not been scored or judged by listening. Successful WAV generation does not prove audio quality parity.

## Interpretation

The smaller package successfully runs on CPU with modest observed resident memory. However, the subsequent requests took 2 minutes 38 seconds and 2 minutes 55 seconds to produce about 5.9 seconds of audio. Keeping the model loaded did not remove the wait. These results favour pre-generated/cached section audio for a free CPU-hosted demo; new arbitrary text would require patience and a queue. A target cloud VM still needs its own benchmark before promising performance.

The earlier recorded PyTorch/MPS smoke test generated 5.69 seconds of speech in 48.4 seconds at 32 steps. That is historical context, not a controlled comparison of quantization: runtime, backend, thread budget, output randomness and desktop load differ.

## Evidence

- [Compact measured-results JSON](cpu-benchmark-results.json) contains all completed timings and pinned identifiers.
- Raw 16-step config/logs/results: `.local-voice/q8-benchmark/20261025T171406Z-cpu2/`.
- Raw 32-step config/logs/results: `.local-voice/q8-benchmark/20261025T171946Z-cpu2/`.
- [16-step subsequent WAV](../../.local-voice/q8-benchmark/20261025T171406Z-cpu2/mixed-16steps-1.wav).
- [32-step subsequent WAV](../../.local-voice/q8-benchmark/20261025T171946Z-cpu2/mixed-32steps-1.wav).

Weights, executables, native logs and WAVs remain outside Git in `.local-voice/`; the report, compact JSON and runner are reviewable repository files.

## Reproduce

The pinned runtime, model, download manifest and raw results are in the ignored `.local-voice/q8-benchmark/` folder. The runner requires those downloads and the original cached Mohammed reference. From this experiment checkout:

```sh
.local-voice/venv/bin/python experiments/voicetut/benchmark_q8.py \
  --threads 2 --repeats 1 --steps 16 --samples mixed
.local-voice/venv/bin/python experiments/voicetut/benchmark_q8.py \
  --threads 2 --repeats 1 --steps 32 --samples mixed
```

The runner writes the effective server configuration, native runtime logs, complete JSON measurements and WAVs to a dated run folder, then stops its dedicated server. It does not change the Vodafone page's backend.

Upstream: [VoiceTut Q8 package](https://huggingface.co/mohammedaly22/VoiceTut-TTS-GGUF), [audio.cpp release](https://github.com/0xShug0/audio.cpp/releases/tag/v0.9.2-drama3-base-small), [OmniVoice runtime options](https://github.com/0xShug0/audio.cpp/blob/v0.9.2-drama3-base-small/docs/models/omnivoice.md).
