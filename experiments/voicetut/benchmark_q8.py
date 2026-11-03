"""Measure the pinned VoiceTut Q8 package on a loopback-only CPU server.

Downloads are separate. All runtime files, logs, WAVs and JSON results remain in
the ignored .local-voice/q8-benchmark folder; this script only runs the benchmark.
"""

from __future__ import annotations

import argparse
import io
import json
import os
import platform
import resource
import signal
import statistics
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen

import numpy as np
import soundfile as sf

REPO = Path(__file__).resolve().parents[2]
ROOT = REPO / ".local-voice" / "q8-benchmark"
SAMPLES = {
    "mixed": "ممكن تعمل update للباقة من Ana Vodafone، وتراجع الـ balance قبل ما تعمل subscribe.",
    "cash": "Vodafone Cash. Vodafone Cash is an E-Wallet provided by Vodafone to make your life easier and run all your errands with a click.",
}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--threads", type=int, default=2)
    parser.add_argument("--repeats", type=int, default=1)
    parser.add_argument("--steps", type=int, nargs="+", default=[16, 32])
    parser.add_argument("--samples", nargs="+", choices=SAMPLES, default=["mixed"])
    parser.add_argument("--port", type=int, default=7861)
    args = parser.parse_args()
    if args.threads < 1 or args.repeats < 1 or any(step < 1 for step in args.steps):
        parser.error("Threads, repeats and steps must be positive.")

    run = ROOT / datetime.now(timezone.utc).strftime(f"%Y%m%dT%H%M%SZ-cpu{args.threads}")
    run.mkdir(parents=True)
    manifest = json.loads((ROOT / "manifest.json").read_text())
    refs = REPO / ".local-voice/hf/hub/models--mohammedaly22--VoiceTut-TTS/snapshots/b36bdf4416864d84f47ca77ce3decf34f6ab16cc/reference_speakers"
    speaker = next(s for s in json.loads((refs / "references.json").read_text()) if s["speaker_name"] == "Mohammed")
    reference = str(refs / Path(speaker["audio_path"]).name)
    config = {
        "host": "127.0.0.1", "port": args.port, "backend": "cpu",
        "threads": args.threads, "lazy_load": False, "max_loaded_models": 1,
        "models": [{"id": "voicetut-q8", "family": "omnivoice", "path": manifest["model_path"], "task": "tts", "mode": "offline"}],
    }
    (run / "server.json").write_text(json.dumps(config, indent=2))
    env = dict(os.environ, VECLIB_MAXIMUM_THREADS=str(args.threads), OMP_NUM_THREADS=str(args.threads), OPENBLAS_NUM_THREADS=str(args.threads))
    command = [str(ROOT / "runtime/audiocpp_server"), "--config", str(run / "server.json"), "--backend", "cpu", "--threads", str(args.threads), "--no-ui", "--log", "--log-file", str(run / "runtime.log")]
    report = {
        "created_utc": datetime.now(timezone.utc).isoformat(), "platform": platform.platform(),
        "machine": platform.machine(), "backend": "cpu", "threads": args.threads,
        "manifest": manifest, "speaker": "Mohammed", "reference_audio": reference,
        "normalization": False, "guidance_scale": 2.0, "speed": 1.0, "runs": [],
    }
    print(f"RESULTS {run}", flush=True)
    started = time.perf_counter()
    log = (run / "server-console.log").open("w")
    process = subprocess.Popen(command, cwd=ROOT / "runtime", env=env, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
    base = f"http://127.0.0.1:{args.port}"
    try:
        while True:
            if process.poll() is not None:
                raise RuntimeError(f"CPU server exited with {process.returncode}; see {run / 'server-console.log'}")
            try:
                with urlopen(base + "/health", timeout=1) as response:
                    report["health"] = json.load(response)
                break
            except Exception:
                if time.perf_counter() - started > 300:
                    raise TimeoutError("CPU server did not become ready within 300 seconds")
                time.sleep(0.25)
        report["startup_seconds"] = round(time.perf_counter() - started, 3)
        print(f"READY CPU threads={args.threads}; startup={report['startup_seconds']}s", flush=True)

        for sample in args.samples:
            for steps in args.steps:
                for repeat in range(args.repeats + 1):
                    payload = {
                        "model": "voicetut-q8", "input": SAMPLES[sample], "response_format": "wav",
                        "voice_ref": reference, "reference_text": speaker["reference_text"],
                        "options": {"language": "arz" if sample == "mixed" else "en", "num_inference_steps": steps, "guidance_scale": 2.0, "speed": 1.0, "seed": 42 + repeat},
                    }
                    request = Request(base + "/v1/audio/speech", data=json.dumps(payload, ensure_ascii=False).encode(), headers={"Content-Type": "application/json"})
                    tick = time.perf_counter()
                    with urlopen(request, timeout=600) as response:
                        wav = response.read()
                    elapsed = time.perf_counter() - tick
                    samples, sr = sf.read(io.BytesIO(wav), dtype="float32")
                    if not np.isfinite(samples).all() or len(samples) == 0 or float(np.max(np.abs(samples))) == 0:
                        raise RuntimeError("Server returned empty, non-finite or silent audio")
                    duration = len(samples) / sr
                    output = run / f"{sample}-{steps}steps-{'warmup' if repeat == 0 else repeat}.wav"
                    output.write_bytes(wav)
                    measurement = {
                        "sample": sample, "text": SAMPLES[sample], "steps": steps, "warmup": repeat == 0,
                        "repeat": repeat, "seed": 42 + repeat, "wall_seconds": round(elapsed, 3),
                        "audio_seconds": round(duration, 3), "rtf": round(elapsed / duration, 3),
                        "sampling_rate": sr, "wav_bytes": len(wav), "rms": float(np.sqrt(np.mean(samples ** 2))),
                        "wav": str(output),
                    }
                    report["runs"].append(measurement)
                    (run / "results.json").write_text(json.dumps(report, indent=2, ensure_ascii=False))
                    print(json.dumps(measurement, ensure_ascii=False), flush=True)
    except BaseException as error:
        report["error"] = repr(error)
        raise
    finally:
        if process.poll() is None:
            os.killpg(process.pid, signal.SIGTERM)
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait()
        log.close()
        usage = resource.getrusage(resource.RUSAGE_CHILDREN)
        report["peak_rss_bytes"] = usage.ru_maxrss if platform.system() == "Darwin" else usage.ru_maxrss * 1024
        report["peak_rss_gib"] = round(report["peak_rss_bytes"] / 1024 ** 3, 3)
        report["server_exit_code"] = process.returncode
        report["summary"] = []
        for sample in args.samples:
            for steps in args.steps:
                measurements = [r for r in report["runs"] if r["sample"] == sample and r["steps"] == steps and not r["warmup"]]
                if measurements:
                    report["summary"].append({
                        "sample": sample, "steps": steps, "count": len(measurements),
                        "median_wall_seconds": round(statistics.median(r["wall_seconds"] for r in measurements), 3),
                        "median_audio_seconds": round(statistics.median(r["audio_seconds"] for r in measurements), 3),
                        "median_rtf": round(statistics.median(r["rtf"] for r in measurements), 3),
                    })
        (run / "results.json").write_text(json.dumps(report, indent=2, ensure_ascii=False))
        print(f"Peak child-process resident memory: {report['peak_rss_gib']} GiB", flush=True)
        print(json.dumps(report["summary"], indent=2), flush=True)


if __name__ == "__main__":
    main()
