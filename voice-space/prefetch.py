"""Build-time step: download Whisper and Kokoro weights into the HF cache."""
from faster_whisper import WhisperModel
from kokoro import KPipeline

WhisperModel("small", device="cpu", compute_type="int8")

VOICES = ["af_heart", "af_bella", "am_michael", "am_fenrir", "bf_emma", "bm_george"]
pipelines = {}
for v in VOICES:
    lang = v[0]
    if lang not in pipelines:
        pipelines[lang] = KPipeline(lang_code=lang)
    for _ in pipelines[lang](
        "Hello there.", voice=v
    ):
        break
print("prefetch done")
