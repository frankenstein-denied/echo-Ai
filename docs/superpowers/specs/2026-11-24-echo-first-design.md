# Echo first: redesign + one-tap check-ins

Approved by the owner on 2026-11-24 from two mockup files beside this doc:
`2026-11-24-echo-first-mockups.html` (13 screens) and `2026-11-24-one-tap-check-ins-mockup.html`.
The mockups are the visual reference; this doc says what each must do.

## Why

Nobody keeps using Echo. Two reasons from the owner:
1. Check-ins come too often and need typing, so people ignore them.
2. People add goals, notes and reminders by hand on each page, although Echo's whole point is to do that for them.

Success: telling Echo is the quickest way to add anything from any page, and a check-in can be answered with one tap.

## Goals

- Echo is reachable from every page (orb in the bottom bar; "tell Echo" box on Notes, Reminders, Music).
- Whatever Echo saves is visible as a saved card with Undo / Edit / Open.
- Speaking works everywhere typing does (mic → `/api/voice/transcribe` → text).
- Check-ins: fewer, back off when ignored, answerable with one tap from the bubble or the notification.
- Every page matches the mockups' look: Echo's dark theme, glow cards, colour per kind.

## Non-goals

- iOS (separate project, later).
- New AI features or prompt changes beyond what the screens need. No new AI call for "Echo noticed".
- Changing what data is stored (no Firestore rules change is expected; if one becomes necessary, deploy rules before the web app).

## Anti-goals

- Removing manual editing: every form stays reachable, one tap deeper.
- Slower pages: the redesign must not add network round trips before a page shows.
- Echo speaking over music or a call (existing guards stay).

## Constraints

- The Android app loads the live site; web changes ship with a Vercel deploy. Native changes ship as APK 1.19 (versionCode 20).
- Next.js 16 in this repo differs from older versions: read `node_modules/next/dist/docs/` before using framework APIs.
- Existing tests (1,088) must stay green; `next build` must pass before merging.
- Android WebView has no Web Speech API, so dictation records audio and uses the existing transcribe route.

## Decisions (owner)

- Layout and content of all 13 mockup screens, as drawn.
- Check-ins approach **A (mixed)**: simple taps save on the phone directly; anything with words goes to Echo.

## What each part does

### 1. Navigation and capture
- **Mobile bottom bar:** Today · Notes · (Echo orb) · Reminders · More. 2nd Brain moves into More.
- **Today tab:** greeting, today's page card (opens the diary), "Up next" (next reminders, the most active goal), and one "Echo noticed" card from local rules only (e.g. water behind, reminder soon); hide it when nothing applies.
- **Echo orb:** tap opens a bottom sheet that starts listening at once (mic); "Type instead" switches to a text box; "Full call" starts the voice call. The sentence goes through the same pipeline as the diary chat (saved to today's page) and the sheet shows the saved cards with Undo.
- **More:** sheet with profile row (+ Settings), six coloured tiles: Goals, Health, 2nd Brain, Music, Connectors, Legacy.
- **Desktop:** sidebar with live counts (notes count, reminders left today, goals %), and on the diary a right "Today" column (water, calories, next reminders, top goal).

### 2. Diary chat
- Saved cards replace the small labels: icon in the kind's colour, title + detail, action (Undo for creates/updates when undo is possible, Edit/Open otherwise).
- When Echo's reply ends with a yes/no question, show "Yes please" / "No thanks" chips that send that text.
- Composer: mic button (record → transcribe → fills the box, user taps send; long recordings capped at 60 s), call button, send button when there is text.
- Shortcut chips above the composer: Meal, +1 water (saves instantly), Mood (opens faces), Sleep.

### 3. Pages
- **Notes:** header actions search + blank note; "tell Echo" box; one row of category chips; notes grouped by day.
- **Reminders:** "tell Echo" box (sent to Echo, result shown as a saved card with Undo, which plays the role of the mockup's preview); Today / Tomorrow / Later / Done in one list; swipe right = done, swipe left = snooze 30 min; delete in a ⋯ menu. The manual title+date form stays behind a header + button.
- **Goals:** summary card in plain words (ahead/behind the year, what to do next); one slim card per goal with icon, progress bar, next milestone and a one-tap progress button (+1 for count-like goals, else +10%); tap opens the existing detail (milestones, slider, delete). Period tabs removed.
- **Health:** three tiles (water +1, calories + meal, sleep edit), mood as one row of 7 faces, week chart with one sentence, "Body view" row opening the existing two-bodies view.
- **2nd Brain:** full-screen orbs, filter chips row, tapping an orb opens a bottom card (title, date, kinds, Open).
- **Music:** "tell Echo / paste a link" box, "your usual now" hero (from the listening patterns), playlists as covers, recently played, slim player above the bar.
- **Connectors:** "Needs you" first, then On, then Off, then Coming soon; each row shows an example of what to ask Echo.
- **Settings:** profile card; grouped rows (Echo: check-ins, voice and language, calories; Phone: pinned notification, permissions) that show the current value and open details on tap; Sign out at the bottom.
- **Everywhere:** one header style (title + live one-liner); empty states suggest a sentence to tell Echo with a button that sends it; delete in ⋯ menus or swipes.

### 4. One-tap check-ins (Android, APK 1.19)
- **Answers by topic:** MOOD → 5 faces; WATER → +1 / +2 / Later; REMINDER → Done / Snooze 30 min / Tell Echo; MEAL → Yes, I ate / Not yet / Skipping / Tell Echo; MORNING, NIGHT, CALORIES, OVERVIEW → Tell Echo / Later.
- **Where:** as buttons on the check-in notification and as chips in the chathead's check-in message.
- **Direct saves (no AI):** mood, water, reminder done or snooze, "not yet" and "skipping". They are written to Firestore by the phone with the existing native session (`EchoApi` + `FirestoreJson`), and the question and answer are added to today's diary page as messages.
- **To Echo (words):** "Yes, I ate" and "Tell Echo" open the chathead chat with the question in place and the mic ready, so the reply goes through the normal chat (meal + calories filed by Echo).
- **Pacing:** each ignored check-in doubles the wait before the next one (up to 8 h); an answer brings back the user's normal gap; at most 5 check-ins a day; a new check-in replaces an unanswered one, so the unread count is never above 1.
- Settings shows the pacing in words ("Up to 5 a day · quiet 10 PM–7 AM").

## Left to the builder
- Component structure, file splits, animation details, exact copy beyond the mockups.
- How "+ Progress" decides between +1 and +10% per goal.
- Whether swipe uses pointer events or a small helper; no new dependency unless clearly needed.
