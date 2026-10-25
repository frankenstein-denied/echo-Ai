---
title: Echo Voice
emoji: 🎙️
colorFrom: indigo
colorTo: purple
sdk: docker
app_port: 7860
pinned: false
---

Speech-to-text (faster-whisper small) and text-to-speech (Kokoro-82M) for the Echo diary app.
All endpoints except `GET /health` require the `X-Echo-Secret` header.
