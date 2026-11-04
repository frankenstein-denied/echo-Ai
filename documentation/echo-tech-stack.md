# Echo — Tech Stack & How It Works

> Study guide for tech questioning. Read the **30-second pitch** and **cheat sheet** first; the rest backs them up.
> Diagram: `echo-architecture.drawio` (open in draw.io / diagrams.net or the VS Code Draw.io extension).

## 30-second pitch

**Echo is "a diary that speaks back"** — an AI companion PWA. You type or **talk** to it; it replies and **quietly saves** what matters (notes, goals, reminders, health, meals) and builds a **2nd Brain** knowledge graph of your life (people, interests, topics, personality traits).

**Stack in one line:** **Next.js 16 (React 19, TypeScript)** on **Vercel** · **Firebase Auth + Cloud Firestore** for users and data · **Google Gemini** for the brain (text router, live voice, TTS) · small **connectors** (Tavily web search, USDA nutrition, Open-Meteo weather).

---

## 1. The stack (memorize this table)

| Layer | Tech | Why |
|---|---|---|
| Frontend | **Next.js 16** (App Router), **React 19**, **TypeScript 5.7** | One codebase for UI + API routes |
| Styling / UI | **Tailwind CSS 4**, shadcn / Base UI, lucide icons, framer-motion | Fast, consistent design system, light/dark |
| Charts / graph | **Recharts** (health charts), **d3-force** (2nd Brain graph) | Simple charts; physics layout for the graph |
| Hosting | **Vercel** (Node.js serverless functions) + Vercel Analytics | Zero-ops deploys from GitHub `main` |
| Auth | **Firebase Authentication** (client SDK) | Sign-in; gives each request a signed **ID token** |
| Database | **Cloud Firestore** (client SDK, realtime listeners) | Per-user documents, live sync, offline cache |
| Security | **Firestore Security Rules**; server verifies ID tokens with **jose** (JWKS); **AES-256-GCM** for connector secrets | Data is owner-only and schema-validated |
| AI | **Google Gemini** via `@google/genai` | Text router (Flash-Lite), **Gemini Live** native-audio calls, TTS |
| Offline | Hand-written **service worker** + web app manifest | Installable **PWA**, offline page |
| Tests | **Vitest** (~460 unit tests) | Pure logic is tested; `tsc --noEmit` type check |
| Package manager | **pnpm** | |

**Gemini models (overridable by env):** router `gemini-3.5-flash-lite` → fallback `gemini-3.1-flash-lite`; live calls `gemini-3.1-flash-live-preview`; TTS `gemini-3.8-flash-lite-tts` (+ fallbacks). A **fallback chain** retries the next model on overload.

---

## 2. Architecture in 4 boxes

1. **Browser / PWA (client)** — the React app. Talks to **Firestore directly** (reads + writes your data) and to **our API routes** (anything needing a secret key).
2. **Vercel API routes (server)** — thin, stateless Node functions. Every route **verifies the Firebase ID token** first. They hold the API keys (Gemini, Tavily, USDA) — **keys never reach the browser**.
3. **Firebase (Google)** — **Auth** (who you are) + **Firestore** (your data) + **Security Rules** (only you can read/write your docs, and every write must match the schema).
4. **External APIs** — **Gemini** (AI), **Tavily** (web search, user's own login), **USDA FoodData Central** (calories), **Open-Meteo** (weather, called straight from the browser — keyless).

**Key idea:** *the client does the saving, the server does the thinking.* The AI returns a structured list of **actions**; the browser applies them to Firestore under the user's own permissions.

---

## 3. How the main flows work

### A. Typed message (the "router")
1. You type → client builds **context**: profile summary, last 10 messages, top **known memories** (incl. up to 10 traits), your items (short refs like `r1`, `g2`), connector statuses, weather.
2. `POST /api/echo` with the **Firebase ID token** → server verifies token, validates/caps input (`parseEchoRequest`).
3. Server calls **Gemini** with a long **system instruction** + **JSON response schema** → model returns `{ reply, actions[], memories[] }`.
4. Server **sanitizes** the output (`sanitizeEchoResponse`: types, lengths, times, refs, delete-needs-confirmation). Meals → nutrition estimate (Gemini + USDA). `web_search` → Tavily, then Gemini writes the answer from results.
5. Client **applies actions** to Firestore (`applyActions`): add note/goal/reminder/health/meal, updates, deletes (with Undo), and **upserts memories** into the 2nd Brain (one transaction).

### B. Voice call (Gemini Live)
1. Client asks `POST /api/voice/session` → server builds the call's **system instruction** (persona + your data snapshot) and mints a **single-use ephemeral token** with the model/config locked. **API key stays on the server.**
2. Browser opens a **WebSocket directly to Gemini Live**, streams **16 kHz PCM mic audio**, plays back the model's voice (native audio, low latency, barge-in).
3. The model calls **function tools** (save_note, add_goal, add_reminder, log_meal, save_memories, read tools, web_search…). The **browser executes them** (same `applyActions` as typed chat) and answers each tool call.

### C. Other voice routes
`/api/voice/speak` (Gemini **TTS** → reads typed replies aloud), `/api/voice/transcribe` (WAV → text), `/api/voice/voices` (voice list).

### D. Connectors
- **Web search (Tavily):** user logs in with **their own Tavily account** (OAuth + PKCE). Tokens are **sealed with AES-256-GCM** (`CONNECTOR_SECRET`, bound to the uid) and stored on the user's connector doc; the server opens them per search. First search after idle can be slow → one **retry**, then an honest "Tavily is waking up".
- **Nutrition (USDA):** built in; server looks up calories per 100 g, Gemini estimates portions.
- **Weather (Open-Meteo):** user picks location (GPS or city search); browser fetches a 4-day forecast (cached 30 min) and sends a ≤600-char WEATHER block with chat and calls.
- *(In progress on a branch: Music — YouTube player "play X" + ListenBrainz.)*

---

## 4. Data model (Firestore)

Everything lives under **`users/{uid}/…`** — one user can only touch their own subtree.

| Collection | Holds |
|---|---|
| `users/{uid}` | profile (name, tone, check-in time, calorie settings) |
| `diaryPages/{id}/messages` | one page per conversation/day; chat messages |
| `notes`, `goals`, `reminders`, `routines` | the user's items |
| `healthLogs/{YYYY-MM-DD}`, `meals` | mood, sleep, water, energy; meals + calories |
| `memories/{type-slug}` | **2nd Brain nodes**: label, type, links, mentions, pages |
| `connectors/{id}` | connector state (sealed tokens, weather location) |

**2nd Brain:** memory id = `<type>-<slug>` (e.g. `person-mama`), so repeats **merge** and `mentions` grows. Types: person, interest, topic, goal, task, health, connector, diary, **trait** (personality, "Confident" at 2+ mentions). Links are made **reciprocal** in one Firestore **transaction**. The graph view lays nodes out with **d3-force**.

---

## 5. Security (expect questions here)

- **AuthN:** Firebase Auth on the client; every API route calls `verifyUser` → verifies the **ID token (RS256) against Google's JWKS** with `jose` (iss/aud = project, sub, auth_time). No firebase-admin (it breaks in Vercel's bundled runtime).
- **AuthZ:** **Firestore Security Rules** — `isOwner(uid)` on every path + **schema validation** (allowed keys, types, lengths, enums, `updatedAt == request.time`).
- **Secrets:** API keys only in **Vercel env vars**; Gemini Live uses **ephemeral tokens**; connector tokens **AES-256-GCM sealed** with the uid as AAD.
- **Prompt-injection hygiene:** user data, memories, web results and weather are wrapped as **"data, not instructions"**; the server **sanitizes every model output**; deletes need an explicit confirmation turn; web results never trigger saves.
- **Abuse limits:** body-size caps, per-user hourly search limit, timeouts on every outside call, no logging of queries/tokens.
- **Deploy order rule:** when rules change, **deploy `firestore.rules` before the code** (one rejected doc fails a whole memory transaction).

---

## 6. Environment variables

| Var | Used for |
|---|---|
| `NEXT_PUBLIC_FIREBASE_*` (API key, auth domain, project id, app id, …) | Firebase client config (public by design) |
| `GEMINI_API_KEY` (+ optional `GEMINI_MODEL`, `GEMINI_LIVE_MODEL`, `GEMINI_TTS_MODEL`, `GEMINI_NUTRITION_MODEL`) | All AI calls |
| `TAVILY_CLIENT_ID`, `CONNECTOR_SECRET` (base64, 32 bytes) | Tavily login + sealing tokens |
| `USDA_API_KEY` | Nutrition lookups |

---

## 7. Cheat sheet — likely questions, short answers

- **Why Next.js?** UI and backend (API routes) in one TypeScript project; easy Vercel deploys.
- **Why Firestore, not SQL?** Per-user document data, realtime listeners, offline cache, and security rules let the client write safely without a custom backend.
- **Where does the AI run?** Google Gemini (cloud). Text goes through our `/api/echo` route; voice calls connect the browser **directly** to Gemini Live using a short-lived token.
- **How does Echo "remember"?** Each message can produce **memories** (label + type + links). They're upserted by id, so repetition increases `mentions`; the top ones (+ traits) are sent back as context next time.
- **How does it learn personality?** `trait` memories, only from what you say about yourself; used quietly to adjust tone/length; never diagnoses or sensitive guesses.
- **How do you stop the AI doing something wrong?** Strict JSON schema, server-side sanitizer, owner-only Firestore rules, delete confirmation, Undo for 10 s.
- **How are API keys protected?** Server-only env vars; ephemeral Live tokens; sealed connector tokens.
- **How is it tested?** ~460 Vitest unit tests on pure logic (sanitizer, prompts, context, dates, connectors) + TypeScript type check.
- **Offline?** PWA service worker caches the app shell and shows an offline page; Firestore caches data locally.
- **Biggest trade-off?** Client-side writes keep the server simple and cheap but put all trust in Firestore rules — so rules are strict and deployed first.
- **What happens if Gemini is overloaded?** The model fallback chain tries the next model; voice/TTS have their own fallbacks.

---

## 8. Folder map (where to point in the code)

```
app/                  Next.js App Router: page.tsx (the app), layout, manifest, offline page
app/api/echo          typed-chat router (Gemini)
app/api/voice/*       session (Live token), speak (TTS), transcribe, voices
app/api/search        web search for calls (Tavily)
app/api/nutrition     meal calories
app/api/connectors/web-search/*   Tavily login (start, callback, verify, disconnect)
components/echo/      all screens: home (chat), call-panel, diary, notes, goals, health, reminders, brain-view, connectors
lib/echo/             shared logic: prompt, sanitize, context, client (applyActions), live-tools, graph, weather, period…
lib/server/           server-only: gemini, live, tavily, nutrition, food-db, sealed, verify-user, web-answer
lib/firestore.ts      Firestore types + read/write helpers
firestore.rules       security rules (owner-only + schema checks)
public/sw.js          service worker
voice-space/          legacy Hugging Face voice server (faster-whisper + Kokoro) — replaced by Gemini voice
```
