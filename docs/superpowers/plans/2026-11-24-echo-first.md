# Echo First Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make telling Echo the quickest way to add anything (orb + tell-Echo boxes + saved cards + dictation), redesign every page to the approved mockups, and make Android check-ins one-tap and less frequent.

**Architecture:** One shared send path (`quickSend`) and three shared UI pieces (`SavedCard`, `useDictation`, `AskEcho`) are built first; page groups then build on them in parallel. The Android check-ins are native Java, independent of the web work, built in parallel and shipped as APK 1.19.

**Tech Stack:** Next.js 16 (read `node_modules/next/dist/docs/` before framework APIs), React 19, Tailwind 4, Firebase JS 13, Vitest 5; Android Java (Capacitor 8), Gradle.

**Spec:** `docs/superpowers/specs/2026-11-24-echo-first-design.md` (visuals: `2026-11-24-echo-first-mockups.html`, `2026-11-24-one-tap-check-ins-mockup.html`).

## Global Constraints

- Echo's theme tokens in `app/globals.css` (background #0b0f14, surface #12171e, primary #2dd4bf); colours per kind: goals amber, reminders orange, notes blue, health green, people pink, interests violet.
- No new npm dependency unless a task says so.
- No Firestore rules change. If one turns out to be required, stop and report it.
- Existing tests stay green: `npx vitest run`; types clean: `npx tsc --noEmit -p .`.
- Every manual form stays reachable (one tap deeper).
- Mobile first: 360 px wide with no horizontal scroll; tap targets ≥ 44 px.
- Android: versionCode 20, versionName "1.19".
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Dictation with the mic permission denied or no audio → a short message, the text box still works (test in Task 1).
2. `quickSend` when Echo's server fails (quota, offline) → no half-saved state, the error text shown in the AskEcho box, the typed text kept (test in Task 1).
3. Undo on a saved card after the item was already edited elsewhere → deletes only the created doc, never something else (test in Task 1).
4. A check-in tap when the native session expired or there is no signal → the notification says "Couldn't save, open Echo", nothing is double-written on retry (test in Task 7).
5. Ignored-check-in backoff across midnight and sleep hours → the daily cap resets per local day and no check-in fires during sleep (test in Task 7).

---

### Task 1: Shared send path and capture pieces (foundation)

**Files:**
- Create: `lib/echo/quick-send.ts`, `lib/echo/quick-send.test.ts`
- Create: `components/echo/saved-card.tsx`, `components/echo/use-dictation.ts`, `components/echo/ask-echo.tsx`
- Modify: `lib/echo/client.ts` (SavedItem gains `docId?: string` for created docs; `applyActions` fills it)

**Interfaces:**
- Produces:
  - `type SavedItem = { type: EchoCategory | 'memory'; label: string; op?: 'update' | 'delete'; ref?: string; kcal?: number; docId?: string }`
  - `quickSend(args: { user: User; profile: UserProfile; text: string }): Promise<{ reply: string; saved: SavedItem[]; failed: string[]; pageId: string }>`: ensures today's diary page (same rule as `diary-view.tsx` ensurePage / `createDiaryPage`), builds context with `buildContext` + `buildItemsContext` from one-off reads, calls `sendToEcho`, saves with `applyEchoResponse` (user message + reply on today's page). Music actions are ignored here (no player).
  - `undoSaved(uid: string, item: SavedItem): Promise<boolean>`: deletes the doc only when `item.docId` is set and `op` is undefined (a create); returns false otherwise.
  - `<SavedCard item={SavedItem} onUndo?={() => void} onOpen?={() => void} />`: icon in the kind's colour, label, kcal when present, action text UNDO / OPEN.
  - `useDictation(user: Pick<User,'getIdToken'>): { state: 'idle' | 'recording' | 'transcribing' | 'error'; error: string; level: number; start(): Promise<void>; stop(): Promise<string>; cancel(): void }`: records 16 kHz mono WAV (reuse the encoder in `lib/echo/call-audio.ts` if it fits), stops itself at 60 s, sends to `transcribe()` in `lib/echo/voice-client.ts`.
  - `<AskEcho user profile placeholder onNavigate? autoFocus? />`: the gradient box from the mockups with a mic; on submit runs `quickSend`, shows the reply in one line and the SavedCards with Undo underneath; keeps the text on error.

- [ ] **Step 1: Write failing tests in `lib/echo/quick-send.test.ts`** (mock Firestore helpers and `sendToEcho` with `vi.mock`)
  - `quickSend creates today's page when none exists and saves both messages there`
  - `quickSend keeps nothing half-saved and rethrows when sendToEcho fails` (no page message written when the request fails)
  - `undoSaved deletes a created doc and refuses updates, deletes and items without docId`
- [ ] **Step 2: Run** `npx vitest run lib/echo/quick-send.test.ts`: expect FAIL (module not found).
- [ ] **Step 3: Implement** `quick-send.ts`, the `docId` addition in `applyActions`, then the three components.
- [ ] **Step 4: Run** `npx vitest run` and `npx tsc --noEmit -p .`: all pass.
- [ ] **Step 5: Commit** `feat(echo-first): quickSend, saved cards, dictation and the tell-Echo box`.

### Task 2: Navigation: bottom bar, Echo orb sheet, More grid, Today view, desktop sidebar

**Files:** `components/echo/mobile-tabbar.tsx`, `components/echo/shell.tsx`, `components/echo/sidebar.tsx`, `components/echo/use-sidebar-data.ts`; create `components/echo/echo-sheet.tsx`, `components/echo/today-view.tsx`, `lib/echo/today-noticed.ts` + test.

**Interfaces:** Consumes Task 1 (`useDictation`, `quickSend`, `SavedCard`, `undoSaved`). Produces the `'Today'` view name in `TabView`.

- [ ] **Step 1: Failing tests in `lib/echo/today-noticed.test.ts`** for `noticed(input: { nowMs: number; waterGlasses: number; waterGoal: number; nextReminderDueMs?: number; sleepStart: string }): { text: string; action?: { label: string; send: string } } | null`: water behind by ≥ 2 glasses after noon → a water line with action "+1 glass"; a reminder due within 30 min → a reminder line; nothing applies → null.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** the tab bar (Today · Notes · orb · Reminders · More), orb sheet (opens listening; Type instead; Full call navigates to the diary and starts the call), More sheet (profile row with Settings, 6 tiles), Today view (greeting, today's page card, Up next, noticed card), sidebar live counts, and the desktop right "Today" column beside the diary (≥ 1280 px only).
- [ ] **Step 4: Run** vitest + tsc → pass.
- [ ] **Step 5: Commit** `feat(echo-first): Echo orb, Today tab, More grid, sidebar counts`.

### Task 3: Diary chat

**Files:** `components/echo/home.tsx` (ActionBadges → SavedCard list, composer), create `lib/echo/quick-replies.ts` + test.

**Interfaces:** Consumes Task 1 (`SavedCard`, `useDictation`, `undoSaved`).

- [ ] **Step 1: Failing tests** for `quickReplies(reply: string): string[]`: a reply ending with a yes/no question ("Want a reminder closer to the date?") → `['Yes please', 'No thanks']`; an open question ("What did you eat?") → `[]`; no question → `[]`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** saved cards under Echo's replies with Undo (creates) or Open, the quick-reply chips on the latest reply only, the mic in the composer (fills the box), and shortcut chips (Meal prefills "I ate ", +1 water saves via the existing health update, Mood opens a faces popover, Sleep prefills "I slept ").
- [ ] **Step 4: Run** vitest + tsc → pass.
- [ ] **Step 5: Commit** `feat(echo-first): diary saved cards, tap answers, dictation, shortcuts`.

### Task 4: Notes and Reminders

**Files:** `components/echo/notes-view.tsx`, `components/echo/reminders-view.tsx`; create `lib/echo/day-groups.ts` + test.

- [ ] **Step 1: Failing tests** for `groupByDay<T>(items: T[], getMs: (t: T) => number, nowMs: number, timeZone: string): { label: string; items: T[] }[]`: labels "Today", "Yesterday", then weekday + date; newest first. And for `reminderSections(reminders, nowMs, timeZone)`: Today / Tomorrow / Later / Done, done last, overdue in Today.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** per the spec (AskEcho on top; Notes chips + day groups; header search and blank note; Reminders list sections, swipe right done, swipe left snooze 30 min with pointer events, ⋯ menu delete, manual form behind header +).
- [ ] **Step 4: Run** vitest + tsc → pass.
- [ ] **Step 5: Commit** `feat(echo-first): notes and reminders pages`.

### Task 5: Goals and Health

**Files:** `components/echo/goals-view.tsx`, `components/echo/health-view.tsx` (+ `components/echo/health/*` as needed); create `lib/echo/goal-pace.ts` + test.

- [ ] **Step 1: Failing tests** for `paceLine(progress: number, periodFraction: number): string` ("A bit behind the year" when behind by > 10 points, "On pace" within 10, "Ahead of the year" when ahead by > 10) and `progressStep(goal: { title: string; progress: number }): { label: string; next: number }` (title with a number like "Read 12 books" → "+1 book" and +100/12 %; otherwise "+ Progress" and +10, capped at 100).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** the Goals summary card and slim cards (tap opens the existing detail), Health tiles, the mood faces row, the week chart line and the Body view row.
- [ ] **Step 4: Run** vitest + tsc → pass.
- [ ] **Step 5: Commit** `feat(echo-first): goals and health pages`.

### Task 6: 2nd Brain, Music, Connectors, Settings, shared header and empty states

**Files:** `components/echo/brain-view.tsx`, `components/echo/music-view.tsx`, `components/echo/connectors-view.tsx` (+ `connectors/*`), `components/echo/settings.tsx`, `components/echo/ui/*` (PageHeader with live one-liner, EmptyState with "tell Echo" button); create `lib/echo/connector-examples.ts` + test.

- [ ] **Step 1: Failing test** `every available connector has a short example of what to ask Echo` over `CONNECTOR_EXAMPLES: Partial<Record<ConnectorId, string>>`, and `connectorSections(states)` orders Needs you → On → Off → Coming soon.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** per the spec and mockups 9–12; Settings check-ins row text "Up to 5 a day · quiet <sleepStart>–<sleepEnd>".
- [ ] **Step 4: Run** vitest + tsc → pass.
- [ ] **Step 5: Commit** `feat(echo-first): brain, music, connectors, settings`.

### Task 7: One-tap check-ins (Android)

**Files:** `android/app/src/main/java/com/echo/app/floating/{CheckInNotifier,CheckInEngine,CheckInRules,CheckInPlanner,ChatheadService}.java`, `.../echo/{FirestoreJson,EchoApi}.java`; create `.../floating/CheckInAnswer.java` (pure answer → writes mapping), `.../floating/CheckInAnswerReceiver.java`, `.../floating/CheckInPacing.java` (pure); tests in `android/app/src/test/java/com/echo/app/floating/`; `android/app/build.gradle` (versionCode 20, versionName "1.19"); `components/echo/settings.tsx` check-ins line only if Task 6 hasn't.

- [ ] **Step 1: Failing JUnit tests**
  - `CheckInPacingTest`: `nextGapMinutes(normalGap, ignoredInARow)` doubles per ignored check-in up to 480 and returns normalGap after an answer; `allowedToday(countToday, 5)` false at 5; the count resets at local midnight; nothing is due inside sleep hours.
  - `CheckInAnswerTest`: answer buttons per topic exactly as the spec lists; MOOD face 1–5 → health mood fields; WATER +1/+2 → waterGlasses increment; REMINDER Done → done=true, Snooze → dueAt + 30 min; MEAL "Yes, I ate" and any "Tell Echo" → OPEN_CHAT (no write).
  - `FirestoreJsonTest` (extend): a commit body that adds the question + answer messages to today's page.
- [ ] **Step 2: Run** `cd android && ./gradlew.bat testDebugUnitTest` → new tests FAIL.
- [ ] **Step 3: Implement** the pacing in the engine (replace unanswered → unread stays ≤ 1), notification actions + chathead chips, the receiver doing the direct write with the existing session (show "Couldn't save, open Echo" on failure; an idempotency key per check-in id so a retry doesn't double-write), and OPEN_CHAT opening the chathead chat panel with the mic ready.
- [ ] **Step 4: Run** the Gradle unit tests and `./gradlew.bat assembleDebug` → pass.
- [ ] **Step 5: Commit** `feat(check-ins): one-tap answers and backoff (1.19)`.

### Task 8: Integrate, review, ship

- [ ] Merge Tasks 2–7 into `feat/echo-first`; resolve conflicts; `npx vitest run`, `npx tsc --noEmit -p .`, `npx next build` (restore `tsconfig.json` formatting afterwards).
- [ ] One whole-branch review by a fresh Opus reviewer; fix what it finds; re-run the three checks.
- [ ] Merge into `main`, push (Vercel deploys), wait for the deploy to be Ready.
- [ ] `bash scripts/release-android.sh "Echo first: one-tap check-ins" "Answer check-ins with one tap" "Fewer check-ins when you're busy"` from `main`.
