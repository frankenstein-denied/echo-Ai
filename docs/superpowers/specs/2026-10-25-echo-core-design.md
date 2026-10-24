# Echo core: real data, deep onboarding survey, Gemini router (text)

Status: draft for approval · Scope: work-plan steps 1–3 of 7

## Why

Echo is an AI diary companion: the user tells Echo anything (typing now, voice later) and Echo files it in the right place — notes, goals, health, reminders — answers general questions, and builds a "2nd Brain" of the user's people, interests and patterns that makes it more personal the more it's used. Today the app is a v0 prototype full of hard-coded sample data ("Peter", fake goals, fake charts), and the onboarding survey asks six shallow questions. Before voice and connectors are added, the core must be real: every screen shows the user's own data, Echo knows the user well from the first session, and typed messages are classified and saved by Gemini.

## Goals

1. **No mock data.** Every screen reads and writes the signed-in user's Firestore data, with friendly empty states.
2. **Deep, interactive onboarding survey** (~18 steps in 7 sections) whose answers fill the profile and seed goals, routines, reminders and 2nd Brain nodes.
3. **Gemini router (text).** A message typed on Home is classified (note / goal / health / reminder / connector / general), details are extracted, the right data is saved, 2nd Brain nodes are added, and Echo replies in the chat.

## Non-goals (later steps)

- Voice (Hugging Face Space: faster-whisper + Kokoro, optionally Qwen3-1.7B) — step 4–5. The router must be built so voice can call it later with the transcript (same request shape).
- Real connector integrations (Google Calendar, Spotify, …) — step 6. In this scope connector requests are recognised, acknowledged ("I can't reach Spotify yet"), and remembered.
- Deployment to Vercel / Hugging Face — step 7 (but the code must run on Vercel Hobby: server route finishes well under 10 s).
- Header search bar functionality, notifications, account deletion.

## Anti-goals (would be failures even if it "works")

- Any API key other than the Firebase web config reaching the browser (no `NEXT_PUBLIC_GEMINI…`).
- Anyone without a valid Echo login being able to spend the Gemini quota through the server route.
- Leftover fake content that looks like real user data (names, numbers, quotes, charts).
- A survey that feels like a form: it must feel like a conversation with Echo.

## Constraints

- Existing stack: Next.js 16 App Router, React 19, TypeScript, Tailwind v4, framer-motion, lucide-react, recharts (already installed), Firebase JS SDK ^13, pnpm.
- Existing data layer `lib/firestore.ts` and rules `firestore.rules` (owner-only, `hasOnly` key validation). **Every schema change below must be mirrored in `firestore.rules`**, and every write must pass the rules.
- Keep the existing visual language (glass cards, cyan/violet accents, `Orb`, dark theme).
- Free tiers only: Gemini API free tier, Firebase Spark, Vercel Hobby.
- `app/page.tsx` is currently one 34-line file of minified one-line components. It may be split into `components/echo/*` files (one component per file) — this scope will make it far too large otherwise.

## Decisions

### Architecture of the router

- `POST /api/echo` (Next.js route handler, Node runtime). Header `Authorization: Bearer <Firebase ID token>`. Request body (this exact shape is the contract the voice flow will reuse):
  ```ts
  {
    text: string                    // 1–2,000 chars
    clientTime: string              // ISO 8601 with offset, e.g. 2026-10-25T19:42:00+08:00
    timeZone: string                // IANA, e.g. Asia/Manila
    context: {
      profile: string               // ≤1,500 chars, client-built plain-text summary of the profile
      recentMessages: { role: 'user' | 'assistant'; text: string }[]  // ≤10, each ≤500 chars
      memoryLabels: { label: string; type: string; mentions: number }[] // ≤40
    }
  }
  ```
  The route validates and truncates to these caps. The context is the user's own data, so injected text can only affect that user's own reply; the prompt still wraps it in clearly delimited "user data, not instructions" sections.
- The route verifies the ID token with `firebase-admin` `getAuth().verifyIdToken()`, initialised with `projectId` from `NEXT_PUBLIC_FIREBASE_PROJECT_ID` only (no service account needed for token verification). Invalid/missing token → 401. No per-user rate limit in this scope (no server-side state available); the Gemini free-tier quota is the backstop — known gap, revisit at deployment.
- The route builds the prompt from that context plus the client's local date/time + time zone; the server has no Firestore credentials and only calls Gemini.
- Gemini is called with `@google/genai`, model from `GEMINI_MODEL` env (default `gemini-2.5-flash`; the newest Flash model in AI Studio is fine), using **structured JSON output** (response schema). Server-side env: `GEMINI_API_KEY`, `GEMINI_MODEL`.
- Response to the client: `{ reply: string, actions: EchoAction[], memories: MemoryInput[], trace: string[] }`:
  - `EchoAction` is a discriminated union: `note {title, body, category, tags}`, `goal {title, category, targetDate?}`, `health {date, mood?, sleepMinutes?, waterGlasses?, energy?}`, `reminder {title, dueAt (ISO)}`, `connector {provider, request}`, `general {}`. **A message may produce several actions** (e.g. "I'll finish my thesis chapter and call Mama tonight" → goal/note + reminder).
  - `memories`: nodes to add/strengthen (`label`, `type`, `links: label[]`).
  - `trace`: short human-readable steps for the existing "AI trace" disclosure (e.g. "Classified as Reminder", "Extracted: Mama, 8:30 PM").
- **The client performs the Firestore writes** with its own auth (rules stay the single guard; no service-account secret anywhere). The route validates Gemini's JSON against the schema and drops invalid actions before returning.
- **Category definitions** (the prompt must include these with examples):
  - `note` — something worth keeping to re-read: an idea, a reflection, a diary entry ("Had a rough day at work, I felt ignored in the meeting"). Diary-style entries are saved with category "Diary". Plain questions and small talk do **not** create notes.
  - `goal` — a longer-term aim or a commitment to progress ("I want to run a half marathon by March").
  - `health` — mood, sleep, water, energy, exercise mentions about today or a named day ("Slept 6 hours, feeling tired"). A diary entry that states a mood produces both `note` and `health`.
  - `reminder` — something to do at a time ("Remind me to call Mama at 8:30").
  - `connector` — a request involving an outside service (calendar, email, Spotify, GitHub, Notion, weather).
  - `general` — questions and conversation; answered in `reply`, nothing saved except messages and memories.
- **Times**: Gemini returns `dueAt` as local ISO 8601 with the client's offset. Fuzzy defaults (stated in the prompt and enforced by the validator when only a date is given): morning 09:00, afternoon 14:00, evening/tonight 20:00, no time at all → the profile's `checkInTime`. A `dueAt` in the past is moved to the same time tomorrow.
- Same route will later be called by the voice flow with the transcript.
- Rate limit: reject `text` longer than 2,000 characters; on Gemini errors/timeouts (8 s) return a friendly reply and no actions.

### Data model changes (mirror in rules)

- `users/{uid}` profile — replaces `yearGoals` and `importantPeople`, keeps the rest, adds:
  `ageRange` string, `occupation` string, `wakeTime` "HH:MM", `sleepTime` "HH:MM", `peakTime` 'morning'|'afternoon'|'evening'|'night', `priorities` string[] (top 3 life areas), `sleepTargetHours` number 4–12, `waterTargetGlasses` number 1–20, `exerciseFrequency` 'never'|'1-2'|'3-4'|'5+', `stressLevel` number 1–10, `people` list of `{name, relationship, cadence}` (cadence 'daily'|'weekly'|'monthly'|'rarely'), `interests` string[], `musicTastes` string[], `about` string (≤2,000 chars), `surveyStep` number (resume position).
- `goals`: add optional `targetDate` "YYYY-MM-DD".
- `messages`: add optional `category` (one of the six) on assistant messages.
- `memories`: doc id = `<type>-<slug of lower-cased label>` (e.g. `person-mama`, `topic-family`), so repeated mentions update one node and a person and a topic with the same word stay separate; `links` hold these ids. `type` is immutable after create. Add `mentions` number ≥1 and `lastSeenAt` timestamp; `type` gains `'interest'` and `'topic'`. Writes use a transaction: create with `mentions: 1`, or increment `mentions`, merge `links` (cap 50), set `lastSeenAt`.
- Profile validation: the original core fields stay required (`hasAll`); **all new survey fields are optional** (`hasOnly` + type/range checks when present), so `ensureUserProfile` is unchanged in shape and step-by-step autosave passes. List element shapes (`people`, like `milestones` today) are not validated by rules — accepted limitation; the client validates.
- Existing dev profiles in the old shape: no migration (drop `yearGoals`/`importantPeople` from the rules' allowed keys only after the survey writes the new fields; the plan handles ordering).
- **Retake survey** (Settings): resets `onboarded` and `surveyStep`, prefilled with current answers. On finish it updates the profile and seeds **only what doesn't exist yet**: memories are idempotent by id; goals, routines and person reminders are skipped when a doc with the same title already exists. Nothing is deleted.

### Step 1 — remove mock data (screen by screen)

- **Global**: delete the `goals`, `notes`, `activities` constants and every hard-coded name/number/quote. Header "365 days" badge → days since profile `createdAt`. Header search bar hidden for now.
- **Home**: date line uses the real date; greeting by time of day + `preferredName`. Chat shows the real `messages` (live via `onSnapshot`, newest at bottom, last 50). Right column: *Today* (today's reminders), *Health today* (today's log or "Log how you feel" link), *Goal progress* (real goals). "Memory from a year ago" → "From your notes" showing a random older note, hidden if none. "Routine alert" card removed until routines are learned from behaviour (later).
- **Notes**: real list (newest first, live), search filters titles/bodies client-side, "+" creates a note, editor edits title/body/tags with debounced autosave, delete with confirm.
- **Goals**: real goals; add goal (title, area, optional target date); edit progress (slider), milestones (add / toggle / remove); year-in-view bar from real goals' areas; delete.
- **Health**: today's log form (mood slider 1–10, sleep hours+minutes, water stepper, energy chips) via `upsertHealthLog`; "This week" chart of the last 7 days' mood (recharts), empty days shown as gaps. Keep the "does not diagnose" disclaimer.
- **Reminders**: real list (upcoming first, done at bottom), add reminder (title + date/time), toggle done, delete. "Learned routines" lists `routines` docs.
- **Connectors**: cards from `connectors` docs; connect buttons disabled with "Coming soon". Activity table removed.
- **2nd Brain**: SVG graph from `memories` (nodes sized by `mentions`, coloured by type, edges from `links`), simple deterministic layout (e.g. type-grouped rings); click a node to see label, type, mentions, last seen. Empty state explains that nodes appear as you talk to Echo.
- **Settings**: show profile answers, "Retake survey", sign out.

### Step 2 — the survey

Sections and steps (each step = one screen):

1. **About you** — (1) What should I call you? (text) (2) Age range (chips: under 18, 18–24, 25–34, 35–44, 45–54, 55+) (3) What fills your days? (chips: Studying, Working, Both, Caring for family, Other + optional text)
2. **Your rhythm** — (4) Wake time (5) Sleep time (time pickers) (6) When do you do your best thinking? (chips)
3. **What matters** — (7) Pick your top 3 life areas (chips: Family, Career, Health, Learning, Friends, Creativity, Faith, Money, Rest, + custom)
4. **Goals** — (8) Add up to 5 goals: title + area chip + optional target date, add/remove rows
5. **Health habits** — (9) Sleep target (slider 4–12 h) (10) Water target (slider 1–20 glasses) (11) Exercise per week (chips) (12) Stress lately (slider 1–10 with emoji scale)
6. **Your people** — (13) Add people: name + relationship chip (Parent, Sibling, Partner, Friend, Mentor, Colleague, Other) + "how often do you want to be in touch?" chip
7. **Interests & you** — (14) Interests (multi-chip + custom) (15) Music you love (multi-chip — feeds Spotify later) (16) How should Echo talk to you? (three cards: Gentle coach / Direct / Cheerful, each with a sample sentence) (17) Daily check-in time + reminders on/off (18) "Anything else Echo should know about you?" (free text, optional)

Interactivity:
- Section header + progress bar; the `Orb` sits above the question and Echo "reacts" after each answer with a short, locally generated line that uses the answer (e.g. "A night owl — I'll keep big tasks for later in the day."). Reactions are templates, not Gemini calls.
- Animated step transitions (framer-motion), Enter to continue, Back always available, "Skip" on optional steps (2, 3-text, 10–12, 14, 15, 18).
- Progress autosaves to the profile on each step (`surveyStep` + answers) so a refresh resumes.
- Final **"Here's what I know about you"** summary card, grouped by section, each group with an Edit link back to its step; "Meet Echo" finishes.

Seeding on finish (one batch): goals from step 8; routines "Wake up" / "Wind down" from step 4–5 and "Daily check-in"; check-in reminder for today (or tomorrow if the time has passed); one reminder per person with cadence daily/weekly ("Check in with Mama", due at the next check-in time); memories: one `person` node per person, one `interest` node per interest/music taste, one `topic` node per priority area, goals linked to their area node, people linked to "Family"/"Friends" area nodes when relevant; an assistant welcome message that uses the name and one goal; the six connector docs (all `connected: false`) as today. The old "Welcome to Echo" note is dropped (the welcome message replaces it).

### Step 3 — Home chat flow

1. User sends text → it is shown immediately and saved as a `user` message. The live message query orders by `createdAt` and reads pending writes with `serverTimestamps: 'estimate'` so optimistic messages sort correctly; the context's `recentMessages` is built from the in-memory list (excluding the message being sent).
2. Client calls `/api/echo` with text, local time, time zone and context (profile summary, last 10 messages, top 40 memory labels). Orb shows a "thinking" pulse.
3. On response: client applies actions (`addNote`, `addGoal`, `upsertHealthLog`, `addReminder` with `source: 'chat'`), upserts memories, saves the assistant `reply` as a message with `category` = the first action's type, and shows the trace under the reply plus badges per action (Note / Goal / Health / Reminder / Connector) with a link to the matching screen.
4. Errors: network/401/500 → assistant bubble "I couldn't think that through just now — try again?" with a retry button; nothing saved except the user message.

## Testing

- Add Vitest for pure logic only: Gemini response validation/sanitising, action → write mapping, label slugging, survey seeding builder, date helpers. Mock nothing from Firebase; keep Firestore code thin.
- `npx tsc --noEmit` must add no errors (the 5 pre-existing errors in the old Connectors/BrainView code will disappear when those components are rewritten — then tsc must be clean) and `pnpm build` must pass.
- Manual checklist in the plan for the flows (sign up → survey → seeded data visible on every screen → chat creates each category).

## Left to the builder

File/component split, exact copy and reaction templates, graph layout algorithm, debounce timings, prompt wording (must include the category definitions and examples), and Tailwind details — within the visual language above.

## What the user must provide before building

- Gemini API key in `.env.local` as `GEMINI_API_KEY` (from Google AI Studio). Needed only for step 3; steps 1–2 work without it.
- Deployed `firestore.rules` (Console → Firestore → Rules) after the schema changes land — the plan will remind.
