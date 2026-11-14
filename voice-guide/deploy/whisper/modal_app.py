"""Whisper on Modal: the gateway's speech-to-text (ADR-0055).

Deploy:  modal secret create vg-whisper WHISPER_TOKEN=<random 32+ chars>
         modal deploy voice-guide/deploy/whisper/modal_app.py
Then set on the gateway: VG_WHISPER_URL=<the printed https URL>, VG_WHISPER_TOKEN=<the same token>.

POST /transcribe?lang=ar|en with the clip as the body (webm/ogg/mp4 Opus, as browsers record) and
Authorization: Bearer <token>  ->  {"text": "...", "language": "ar", "duration": 2.4}

Nothing is written to disk and nothing is logged: the clip lives in memory for one request.
Capacity and spend: one L4 per container, MAX_CONTAINERS (default 2), scaled to zero after
SCALEDOWN seconds idle. Set a workspace spending limit in Modal's settings as well.
"""
import os

import modal

MODEL = "large-v3-turbo"  # multilingual; Arabic (Egyptian included) and English
MAX_CONTAINERS = int(os.environ.get("MAX_CONTAINERS", "2"))
SCALEDOWN = int(os.environ.get("SCALEDOWN", "120"))
MAX_BYTES = 512 * 1024


def cache_model():
    from faster_whisper import WhisperModel

    WhisperModel(MODEL, device="cpu", compute_type="int8", download_root="/model-cache")


image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install("faster-whisper==1.1.1", "fastapi[standard]==0.115.12")
    .env({"HF_HOME": "/model-cache"})
    .run_function(cache_model)
)
app = modal.App("vg-whisper")


@app.cls(
    image=image, gpu="L4", cpu=2, memory=8192,
    min_containers=0, max_containers=MAX_CONTAINERS, scaledown_window=SCALEDOWN,
    timeout=120, secrets=[modal.Secret.from_name("vg-whisper")],
)
@modal.concurrent(max_inputs=4)
class Whisper:
    @modal.enter()
    def load(self):
        from faster_whisper import WhisperModel

        self.model = WhisperModel(MODEL, device="cuda", compute_type="float16", download_root="/model-cache")

    @modal.asgi_app()
    def web(self):
        import hmac
        import io

        from fastapi import FastAPI, HTTPException, Request

        api = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
        token = os.environ["WHISPER_TOKEN"]

        @api.post("/transcribe")
        async def transcribe(request: Request, lang: str = "ar"):
            auth = request.headers.get("authorization", "")
            if not hmac.compare_digest(auth, f"Bearer {token}"):
                raise HTTPException(status_code=401)
            body = await request.body()
            if not body or len(body) > MAX_BYTES:
                raise HTTPException(status_code=413)
            language = lang[:2] if lang[:2] in ("ar", "en") else None
            segments, info = self.model.transcribe(
                io.BytesIO(body), language=language, beam_size=1, vad_filter=True,
                condition_on_previous_text=False, without_timestamps=True,
            )
            text = " ".join(s.text.strip() for s in segments).strip()
            return {"text": text[:500], "language": info.language, "duration": round(info.duration, 2)}

        return api
