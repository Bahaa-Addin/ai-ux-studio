"""VoiceTut Gradio API, shared by Modal and the optional local experiment."""

from __future__ import annotations

import os
import time
import uuid
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
LOCAL_DIR = Path(os.environ.get("VOICETUT_DATA_DIR", str(REPO_ROOT / ".local-voice")))
os.environ.setdefault("HF_HOME", str(LOCAL_DIR / "hf"))
os.environ.setdefault("HF_HUB_CACHE", str(LOCAL_DIR / "hf" / "hub"))
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")

import gradio as gr
from huggingface_hub import snapshot_download
from voicetut_tts import GenerationParams, VoiceTutTTS

MODEL_ID = "mohammedaly22/VoiceTut-TTS"
MODEL_REVISION = "b36bdf4416864d84f47ca77ce3decf34f6ab16cc"
MODEL_DIR = Path(snapshot_download(repo_id=MODEL_ID, revision=MODEL_REVISION))
AUDIO_DIR = LOCAL_DIR / "audio"
AUDIO_DIR.mkdir(parents=True, exist_ok=True)

device = os.environ.get("VOICETUT_DEVICE", "mps")
print(f"Loading cached VoiceTut checkpoint from {MODEL_DIR} on {device}", flush=True)
load_started = time.perf_counter()
tts = VoiceTutTTS.from_pretrained(
    str(MODEL_DIR), device="cpu" if device == "mps" else device,
    dtype="float16", language="arz", low_cpu_mem_usage=True
)
print(f"Checkpoint and audio tokenizer loaded in {time.perf_counter() - load_started:.1f}s", flush=True)
move_started = time.perf_counter()
if device == "mps":
    tts.model.to("mps")
    tts.model.audio_tokenizer.to("cpu")
print(f"Main model is on {tts.model.device}; audio tokenizer is on {tts.model.audio_tokenizer.device}; ready in {time.perf_counter() - move_started:.1f}s", flush=True)

ARABIC_NAMES = {
    "Ahmed": "أحمد", "Ali": "علي", "Hassan": "حسن", "Karim": "كريم",
    "Mahmoud": "محمود", "Mohammed": "محمد", "Mostafa": "مصطفى",
    "Ramy": "رامي", "Shaker": "شاكر", "Tareq": "طارق", "Yehia": "يحيى",
    "Youssef": "يوسف", "Hadeer": "هدير", "Hanan": "حنان", "Mariam": "مريم",
    "Rana": "رنا", "Sarah": "سارة", "Yasmin": "ياسمين", "Yara": "يارا",
}


def info():
    return {
        "mock": False,
        "model_version": f"VoiceTut {os.environ.get('VOICETUT_HOST', 'local')} · {MODEL_DIR.name[:7]}",
        "package_version": "0.1.1",
        "sampling_rate": tts.sampling_rate,
        "speakers": [
            {
                "speaker_id": speaker.speaker_id,
                "speaker_name": speaker.speaker_name,
                "arabic_name": ARABIC_NAMES.get(speaker.speaker_name, speaker.speaker_name),
                "gender": speaker.gender,
            }
            for speaker in tts.list_speakers()
        ],
    }


def synthesize(text, language, mode, speaker, ref_audio, ref_text, steps, guidance, speed, normalize):
    if mode != "builtin":
        raise gr.Error("This experiment supports built-in voices only.")
    if not isinstance(text, str) or not text.strip() or len(text) > 1500:
        raise gr.Error("Enter between 1 and 1,500 characters.")
    if language not in {"arz", "en"}:
        raise gr.Error("Choose Egyptian Arabic / mixed or English.")
    if speaker not in tts.registry.names():
        raise gr.Error("Choose one of the listed VoiceTut voices.")
    if steps not in {16, 32, 48} or guidance != 2.0 or speed not in {0.85, 1.0, 1.15}:
        raise gr.Error("Choose the generation settings offered by the demo.")

    started = time.perf_counter()
    filename = AUDIO_DIR / f"voicetut-{uuid.uuid4().hex}.wav"
    wave = tts.synthesize(
        text.strip(), speaker=speaker, language=language,
        normalize=bool(normalize), output=str(filename),
        params=GenerationParams(
            num_step=int(steps), guidance_scale=float(guidance), speed=float(speed)
        ),
    )
    duration = len(wave) / tts.sampling_rate
    elapsed = time.perf_counter() - started
    print(f"Generated {duration:.2f}s for {len(text)} characters in {elapsed:.1f}s", flush=True)
    return str(filename), {"audio": duration, "generation_seconds": round(elapsed, 2)}


with gr.Blocks(title="Vodafone VoiceTut API", delete_cache=(60, 600)) as demo:
    info_button = gr.Button("Info", visible=False)
    info_result = gr.JSON()
    info_button.click(fn=info, inputs=[], outputs=info_result, api_name="info")

    controls = [
        gr.Textbox(), gr.Textbox(), gr.Textbox(), gr.Textbox(), gr.File(),
        gr.Textbox(), gr.Number(), gr.Number(), gr.Number(), gr.Checkbox(),
    ]
    audio_result = gr.Audio(type="filepath", format="wav")
    metrics_result = gr.JSON()
    synth_button = gr.Button("Synthesize", visible=False)
    synth_button.click(
        fn=synthesize, inputs=controls, outputs=[audio_result, metrics_result], api_name="synthesize"
    )

demo.queue(default_concurrency_limit=1, max_size=2)
demo.launch(
    server_name=os.environ.get("VOICETUT_BIND", "127.0.0.1"), server_port=7860, share=False,
    show_error=True, quiet=False, strict_cors=True, ssr_mode=False,
)
