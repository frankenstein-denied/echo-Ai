import hmac
import io
import os
import tempfile
import threading

import numpy as np
import soundfile as sf
from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel

STT_MODEL = "small"
SAMPLE_RATE = 24000
MAX_UPLOAD_BYTES = 10 * 1024 * 1024
MAX_AUDIO_SECONDS = 120
MAX_TEXT_CHARS = 1000

VOICES = [
    {"id": "af_heart", "label": "Heart (US, female)"},
    {"id": "af_bella", "label": "Bella (US, female)"},
    {"id": "am_michael", "label": "Michael (US, male)"},
    {"id": "am_fenrir", "label": "Fenrir (US, male)"},
    {"id": "bf_emma", "label": "Emma (UK, female)"},
    {"id": "bm_george", "label": "George (UK, male)"},
]
VOICE_IDS = {v["id"] for v in VOICES}

app = FastAPI(title="Echo Voice")

_lock = threading.Lock()
_whisper = None
_pipelines = {}


def _secret() -> str:
    return os.environ.get("ECHO_VOICE_SECRET", "")


def require_secret(provided: str | None) -> None:
    expected = _secret()
    if not expected or not provided or not hmac.compare_digest(
        provided.encode("utf-8"), expected.encode("utf-8")
    ):
        raise HTTPException(status_code=401, detail="unauthorized")


def get_whisper():
    global _whisper
    with _lock:
        if _whisper is None:
            from faster_whisper import WhisperModel

            _whisper = WhisperModel(STT_MODEL, device="cpu", compute_type="int8")
        return _whisper


def get_pipeline(lang: str):
    with _lock:
        if lang not in _pipelines:
            from kokoro import KPipeline

            _pipelines[lang] = KPipeline(lang_code=lang)
        return _pipelines[lang]


def _warm() -> None:
    try:
        get_whisper()
        get_pipeline("a")
        get_pipeline("b")
    except Exception as exc:  # warm-up is best effort; lazy load retries on use
        print("warm-up failed:", exc)


def _ready() -> bool:
    return _whisper is not None and "a" in _pipelines and "b" in _pipelines


@app.on_event("startup")
def startup() -> None:
    threading.Thread(target=_warm, daemon=True).start()


@app.get("/health")
def health():
    if not _ready():
        threading.Thread(target=_warm, daemon=True).start()
    return {"ok": True, "stt": STT_MODEL, "tts": "kokoro-82m", "ready": _ready()}


@app.get("/voices")
def voices(x_echo_secret: str | None = Header(default=None)):
    require_secret(x_echo_secret)
    return {"voices": VOICES}


@app.post("/transcribe")
async def transcribe(
    audio: UploadFile = File(...), x_echo_secret: str | None = Header(default=None)
):
    require_secret(x_echo_secret)
    data = await audio.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="audio too large")
    if not data:
        raise HTTPException(status_code=422, detail="empty audio")

    model = get_whisper()
    suffix = os.path.splitext(audio.filename or "")[1][:8] or ".webm"
    path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as f:
            f.write(data)
            path = f.name
        try:
            segments, info = model.transcribe(path, beam_size=1, vad_filter=True)
            if info.duration > MAX_AUDIO_SECONDS:
                raise HTTPException(status_code=422, detail="audio too long")
            text = " ".join(s.text.strip() for s in segments).strip()
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(status_code=422, detail="could not decode audio")
    finally:
        if path and os.path.exists(path):
            os.remove(path)
    return {"text": text, "language": info.language, "duration": round(info.duration, 2)}


class SpeakBody(BaseModel):
    text: str
    voice: str = "af_heart"


@app.post("/speak")
def speak(body: SpeakBody, x_echo_secret: str | None = Header(default=None)):
    require_secret(x_echo_secret)
    text = body.text.strip()
    if not text or len(text) > MAX_TEXT_CHARS:
        raise HTTPException(status_code=422, detail="text must be 1-1000 characters")
    if body.voice not in VOICE_IDS:
        raise HTTPException(status_code=422, detail="unknown voice")

    pipeline = get_pipeline(body.voice[0])
    chunks = []
    # KPipeline is not guaranteed thread-safe; serialize synthesis.
    with _lock:
        for result in pipeline(text, voice=body.voice):
            if result.audio is not None:
                chunks.append(np.asarray(result.audio, dtype=np.float32).reshape(-1))
    if not chunks:
        raise HTTPException(status_code=422, detail="no audio generated")
    buf = io.BytesIO()
    sf.write(buf, np.concatenate(chunks), SAMPLE_RATE, format="WAV", subtype="PCM_16")
    return Response(content=buf.getvalue(), media_type="audio/wav")
