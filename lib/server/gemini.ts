import { GoogleGenAI, ThinkingLevel } from '@google/genai'
import { FallbackError, geminiModels, withModelFallback } from './gemini-fallback'
import { ttsAudioToWav } from './wav'

// Chosen from live probing on the project key; see .superpowers/sdd/echo-voice-router/task-4-report.md.
export const DEFAULT_TTS_MODELS = ['gemini-3.8-flash-lite-tts', 'gemini-3.8-flash-tts', 'gemini-3.1-flash-tts-preview']

export const VOICES = [
  { id: 'Kore', label: 'Kore (firm)' },
  { id: 'Puck', label: 'Puck (upbeat)' },
  { id: 'Charon', label: 'Charon (informative)' },
  { id: 'Fenrir', label: 'Fenrir (excitable)' },
  { id: 'Aoede', label: 'Aoede (breezy)' },
  { id: 'Leda', label: 'Leda (youthful)' },
  { id: 'Orus', label: 'Orus (firm)' },
  { id: 'Zephyr', label: 'Zephyr (bright)' },
]
export const DEFAULT_VOICE = 'Kore'

const STT_TIMEOUT_MS = 12000
const TTS_TIMEOUT_MS = 9000

function client(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw Object.assign(new Error('GEMINI_API_KEY is not set'), { status: 500 })
  return new GoogleGenAI({ apiKey })
}

export function ttsModels(env: string | undefined = process.env.GEMINI_TTS_MODEL): string[] {
  const list = (env ?? '').split(',').map((m) => m.trim()).filter(Boolean)
  return list.length ? list : DEFAULT_TTS_MODELS
}

const STT_INSTRUCTION =
  'Transcribe this audio. Return only the verbatim transcript in the language spoken, with no commentary, labels or quotes. If there is no speech, return an empty string.'

export async function transcribeWav(wav: Buffer): Promise<{ text: string; model: string }> {
  const ai = client()
  const { value, model } = await withModelFallback(geminiModels(process.env.GEMINI_MODEL), STT_TIMEOUT_MS, async (model, signal) => {
    const result = await ai.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ text: STT_INSTRUCTION }, { inlineData: { mimeType: 'audio/wav', data: wav.toString('base64') } }] }],
      config: { temperature: 0, thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL }, abortSignal: signal },
    })
    return (result.text ?? '').trim()
  })
  return { text: value, model }
}

export async function synthesizeSpeech(text: string, voice: string, models = ttsModels()): Promise<{ wav: Buffer; model: string }> {
  const ai = client()
  const { value, model } = await withModelFallback(models, TTS_TIMEOUT_MS, async (model, signal) => {
    const result = await ai.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ text }] }],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
        abortSignal: signal,
      },
    })
    const part = result.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)
    const data = part?.inlineData?.data
    // Empty audio is retried on the next model, like a malformed response.
    if (!data) throw new SyntaxError('TTS returned no audio')
    return ttsAudioToWav(Buffer.from(data, 'base64'), part?.inlineData?.mimeType)
  })
  return { wav: value, model }
}

export function mapGeminiError(err: unknown): { status: number; body: { error: 'quota' | 'failed' } } {
  const e = err as { status?: number; allQuota?: boolean } | null
  // Quota only when every attempted model was rate-limited (or a single non-chain call was).
  const quota = e instanceof FallbackError ? e.allQuota : e?.status === 429
  return quota ? { status: 429, body: { error: 'quota' } } : { status: 502, body: { error: 'failed' } }
}
