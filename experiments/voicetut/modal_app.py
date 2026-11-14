"""Deploy with: modal deploy experiments/voicetut/modal_app.py.

Only these two source files are uploaded; local weights and credentials are not.
Weights are downloaded directly into the cloud image from pinned HF snapshots.
"""
import os
from pathlib import Path

import modal

MODEL_REVISION = "b36bdf4416864d84f47ca77ce3decf34f6ab16cc"
TOKENIZER_REVISION = "528e871c2a26c4f0f7773b9754e2e1acae20899d"


def cache_models():
    from huggingface_hub import snapshot_download

    model = Path(snapshot_download("mohammedaly22/VoiceTut-TTS", revision=MODEL_REVISION))
    tokenizer = snapshot_download("eustlb/higgs-audio-v2-tokenizer", revision=TOKENIZER_REVISION)
    # OmniVoice recognises a bundled tokenizer and avoids resolving an unpinned revision.
    (model / "audio_tokenizer").symlink_to(tokenizer, target_is_directory=True)


image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("git", "ffmpeg", "libsndfile1")
    .pip_install("torch==2.8.0", "torchaudio==2.8.0")
    .pip_install(
        "git+https://github.com/k2-fsa/OmniVoice.git@08be0b4ccbac3e13e374e86fbfead4b4cac343e2",
        "voicetut-tts==0.1.1", "transformers==5.20.2", "gradio==6.30.0",
    )
    .env({
        "HF_HOME": "/model-cache", "HF_HUB_CACHE": "/model-cache/hub",
        "TOKENIZERS_PARALLELISM": "false", "VOICETUT_DATA_DIR": "/tmp/voicetut",
        "VOICETUT_DEVICE": "cuda", "VOICETUT_HOST": "Modal L4",
        "VOICETUT_BIND": "0.0.0.0",
    })
    .run_function(cache_models)
    .add_local_file(Path(__file__).with_name("local_api.py"), "/app/voice_api.py")
)
app = modal.App("vodafone-voicetut")

# Capacity for the public demo (ADR-0053 §5): one L4 per container. Deploy with
# MAX_CONTAINERS=2 modal deploy ... to serve more visitors at once; keep a Modal spending limit set.
MAX_CONTAINERS = int(os.environ.get("MAX_CONTAINERS", "1"))


@app.function(
    image=image, gpu="L4", cpu=2, memory=8192,
    min_containers=0, max_containers=MAX_CONTAINERS, scaledown_window=60,
    timeout=600, startup_timeout=600,
)
@modal.concurrent(max_inputs=100)
@modal.web_server(7860, startup_timeout=300, label="vodafone-voicetut")
def serve():
    import subprocess

    subprocess.Popen(["python", "-u", "/app/voice_api.py"])
