// Builds Echo's notification chime (android/app/src/main/res/raw/echo_chime.wav): two soft, bell-like notes
// rising a fifth, like a friend saying "hey!". The web app plays the same notes live (lib/echo/cues.ts).
// Run: node scripts/make-chime.mjs
import { writeFileSync } from 'node:fs'

const RATE = 24000
const SECONDS = 1.1
const PEAK = 0.6 // about -4.4 dBFS: soft, never harsh
// [frequency Hz, start s, loudness]
const NOTES = [
  [440, 0, 0.8], // A4
  [659.25, 0.13, 1], // E5
]
// A warm bell: the fundamental, a soft octave and a faint fifth above it.
const PARTIALS = [
  [1, 1],
  [2.01, 0.25],
  [3, 0.08],
]
const ATTACK = 0.006
const DECAY = 0.28 // seconds for the note to fall to about a third
const FADE_OUT = 0.06

const n = Math.round(RATE * SECONDS)
const out = new Float64Array(n)
for (const [freq, start, gain] of NOTES) {
  for (let i = Math.round(start * RATE); i < n; i++) {
    const t = i / RATE - start
    const env = (t < ATTACK ? t / ATTACK : 1) * Math.exp(-t / DECAY)
    let v = 0
    for (const [mult, amp] of PARTIALS) v += amp * Math.sin(2 * Math.PI * freq * mult * t)
    out[i] += gain * env * v
  }
}
let max = 0
for (const v of out) max = Math.max(max, Math.abs(v))
const fadeFrom = n - Math.round(FADE_OUT * RATE)
const pcm = Buffer.alloc(n * 2)
for (let i = 0; i < n; i++) {
  const fade = i >= fadeFrom ? (n - i) / (n - fadeFrom) : 1
  pcm.writeInt16LE(Math.round((out[i] / max) * PEAK * fade * 32767), i * 2)
}
const header = Buffer.alloc(44)
header.write('RIFF', 0)
header.writeUInt32LE(36 + pcm.length, 4)
header.write('WAVE', 8)
header.write('fmt ', 12)
header.writeUInt32LE(16, 16)
header.writeUInt16LE(1, 20) // PCM
header.writeUInt16LE(1, 22) // mono
header.writeUInt32LE(RATE, 24)
header.writeUInt32LE(RATE * 2, 28)
header.writeUInt16LE(2, 32)
header.writeUInt16LE(16, 34)
header.write('data', 36)
header.writeUInt32LE(pcm.length, 40)
const path = new URL('../android/app/src/main/res/raw/echo_chime.wav', import.meta.url)
writeFileSync(path, Buffer.concat([header, pcm]))
console.log(`wrote ${path.pathname} (${44 + pcm.length} bytes)`)
