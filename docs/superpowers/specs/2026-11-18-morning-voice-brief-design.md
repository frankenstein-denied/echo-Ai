# Daily voice brief — design

Date: 2026-11-18. Status: draft for owner review.
First of four "wow factor" features (order: brief → haptic/sound identity → chathead reacts to the world → letters to future you). Each gets its own design.

## Intent

Echo has no "wow" in daily use. The brief is a one-tap moment where Echo feels like it knows you: your day in your ear, said the way *your* Echo talks, then a normal conversation. It must stay simple: no setup, no new screen to learn.

## What the owner decided

- **Trigger:** tap the Today orb. The **first tap of the day, at any time of day**, gives the brief. Later taps that day start a normal call.
- **Personality:** Echo speaks in the personality it learned from the 2nd Brain (trait memories + the onboarding Tone).
- **Content (~40 s):** weather, today's reminders, one goal nudge, and a song offer from the music connector.
- **After the brief:** Echo waits for the user to talk back — a **full back-and-forth voice call, same as the "Talk to Echo" button**.
- **Look:** mockup A, "Voice ripple": the orb pulses with Echo's voice, rings ripple outward, live captions underneath.
- **Anti-goal:** it must **not say the same thing every day**. Repetition is the failure that makes people skip it.

## Goals

1. One tap on the Today orb → within ~2–3 s Echo starts speaking the brief.
2. The brief sounds like this user's Echo (tone + traits), not a weather app.
3. Every day's brief feels different: leads with what's new or notable, varies its opening and order, never reuses yesterday's lines.
4. Ends with a song offer and one open question, then the call continues normally (all existing call tools work: reminders, goals, play_music, etc.).
5. Works on web and inside the Android app (same WebView).

## Non-goals

- No automatic/alarm brief that plays by itself, no scheduled notification brief.
- No new voice or TTS provider; no voice cloning.
- No new settings screen. (A brief on/off is not needed for v1: a user who doesn't want it just uses the call button.)
- No change to the chathead in this feature.

## Anti-goals (failure even if it "works")

- Same opening / same structure every day ("Good morning! Here's your weather…").
- Reading out lists ("You have three reminders: one, …") or the full forecast.
- Nagging about goals, guilt-tripping ("you haven't run in 5 days").
- Mentioning missing setup ("You haven't connected weather").
- Music auto-playing over the voice.
- Feeling slow: a long silent wait after the tap.

## How it works (existing pieces it builds on)

The live call already supports "Echo speaks first": after the websocket opens, `components/echo/call-panel.tsx` sends a hidden kickoff (`greetingKickoff()` in `lib/echo/context.ts`, marker `[call connected]`), and `LIVE_PERSONA` in `lib/server/live.ts` has a GREETING rule. The session already receives profile (incl. Tone), known memories (traits included), weather, music (playlists + listening habits), and a snapshot of goals/reminders/health. Output transcription is already on and shown as the live transcript.

So the brief is **a call that starts with a different kickoff**:

1. **Brief kickoff.** Add a second marker, e.g. `[daily brief]`, and a `briefKickoff(clientTime, recentBriefs)` next to `greetingKickoff`. The call hook (`useEchoCall`) takes a `mode: 'greeting' | 'brief'` at start and sends the matching kickoff.
2. **Brief rule in the persona.** Add a DAILY BRIEF section to `LIVE_PERSONA` that applies only on the brief marker:
   - ~40 s spoken (roughly 90–110 words), natural speech, no lists.
   - Use Tone + traits for length and warmth (Direct = shorter, Gentle coach = softer, Cheerful = upbeat).
   - Pick what matters today: weather only as it affects them (rain, heat, cold), the reminders that matter most (name 1–3, summarise the rest), one goal nudge phrased as encouragement, and a personal touch from memories when there's a good one.
   - Skip any part with no data, silently.
   - **Freshness:** lead with whatever is new or most notable today; vary the opening line and the order; must not reuse phrasing from the RECENT BRIEFS given.
   - End with a song offer drawn from MUSIC listening habits/playlists (only if MUSIC has something; otherwise skip) and **one** open question. If the user says yes, use the existing `play_music` tool (opens paused, per current call rules).
   - The brief replaces the normal greeting for that call.
3. **Remembering recent briefs (for freshness).** When the brief's model turn finishes, save its transcript text as the day's brief: `users/{uid}/briefs/{YYYY-MM-DD}` = `{ text, createdAt }` (text capped ~1,000 chars). At the next brief, the client loads the last 3 and sends them in the session request (new optional field `recentBriefs: string[]`, each capped, validated in `parseLiveSessionRequest`) and the system instruction renders them in a `=== USER DATA: RECENT BRIEFS ===` section (data, not instructions).
4. **"First tap of the day."** Today's brief exists if `briefs/{today}` exists (local date in the user's time zone). Firestore, not localStorage, so phone and laptop agree. Missing doc → brief mode; present → normal greeting call. If the call fails before Echo speaks, nothing is saved, so the next tap tries the brief again.
   - **Partly heard brief (my call):** save it, and so mark the day done, when the brief's model turn completes **or** when the user interrupts by talking (they engaged, so the brief did its job). Don't save if the user hangs up before the turn completes; the next tap gives a fresh brief. Only completed briefs go into RECENT BRIEFS; an interrupted one is saved with `partial: true` and left out of the freshness list.
5. **Firestore rules.** Add `users/{uid}/briefs/{day}` (owner read/write, `text` string ≤ cap, `createdAt` timestamp). Deploy rules before the app code (see project rule: rules first).

### The orb while speaking (mockup A)

- Tapping the Today orb (today it's a static SVG with no tap action) starts the call in brief mode when no brief exists for today, otherwise a normal call. The "Talk to Echo" button keeps working as now (normal greeting call).
- **Reaching the brief when the welcome is hidden (owner decided):** the welcome orb disappears once today's page has any message, including chathead check-ins (`showTodayWelcome` in `lib/echo/today-orb.ts`). So **until today's brief has played, a small Today orb is pinned at the top of today's page** (any message state, both layouts, not on older pages, not in the `embed === 'chat'` chathead panel). Tapping it starts the brief. Once `briefs/{today}` exists it goes away. When the full welcome is showing, only the welcome orb is shown (no duplicate).
- **Where the speaking orb lives (owner decided):**
  - Touch layout: in `CallScreen`, replacing the Echo mark.
  - Desktop: a **big Today orb in the chat area**, above the live captions/bubbles, during the brief, so it looks like mockup A. `CallBar` stays as is. When the brief turn ends the call continues as usual; the builder may keep the orb small or let it shrink away after the brief.
- The speaking orb is the **Today orb** (the existing `MemoryOrb` for today's page), with:
  - a pulse driven by Echo's output audio level (scale ~1.00–1.06),
  - 2–3 rings rippling outward while Echo is speaking, stopping while listening,
  - live captions = the existing live transcript (no new caption system).
- Normal (non-brief) calls keep the current Echo mark. *(Builder may use the orb for all calls if simpler.)*
- `prefers-reduced-motion`: no rings, no pulse; a gentle static glow while speaking.
- Accessibility: the orb gets a button role and label ("Play today's brief" / "Talk to Echo").

## Constraints

- Voice is on only when the user enabled it (`prefs.enabled`); when voice is off, tapping the orb does nothing new (keep current behaviour and the "Turn on voice in Settings" hint).
- Same Gemini Live model, token and limits as calls today; the brief must not add a second network round-trip before speaking beyond loading ≤3 small docs (do it in parallel with the existing snapshot prefetch).
- Quota errors etc. use the existing call error messages.
- Tests: unit tests for `briefKickoff`, the new request field parsing/capping, the persona containing the brief marker rule, "brief exists today" date logic across time zones, and the rules.

## Left to the builder

- Exact wording of the DAILY BRIEF rule and the kickoff text.
- How the output audio level is measured (analyser on the playback node is fine).
- Ring timing/colour (use the orb's dominant kind colour or `PEARL`).
- Whether the brief text is saved from the output transcription or from the saved assistant message.

## Calls made by Claude (owner: check these)

- Brief = a live call with a new kickoff marker (`[daily brief]`), not a separate pre-recorded text-to-speech clip, so the voice and personality stay the same into the conversation.
- "Brief done today" is stored in Firestore `users/{uid}/briefs/{YYYY-MM-DD}` so devices agree. The last 3 briefs are sent back to Echo so it avoids repeating itself.
- A partly heard brief counts if you talked back, but not if you hung up early.
- Missing data (no weather, no reminders, no music) is skipped silently.
- No on/off setting in v1.
- Reduced-motion users get a static glow instead of ripples.
