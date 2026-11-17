# Legacy — design

Date: 2026-11-17 · Status: draft for owner approval

## Intent

The owner's professor requires an inheritance feature: when an Echo user dies, people they chose
receive what Echo knew about them and can keep "talking" to them. This is one of the stated
purposes of the 2nd Brain — it stores a person so the people who loved them can reminisce.

Success: an inheritor opens a released legacy, answers the owner's question, and chats with
something that feels like messaging the owner — their language, their typing habits, the
nickname they used — grounded in memories the owner actually left, and never inventing a past.

## Decisions the owner made

1. **Inheritors are Echo users.** The owner adds them on a new **Legacy** page by their Echo email.
2. **Request → accept.** The owner sends a request; the inheritor accepts or declines on their own
   Legacy page. Once accepted, the inheritor stays in the owner's **My inheritors** list and the
   owner stays in the inheritor's **My legacies** list.
3. **Personal question.** For each inheritor the owner picks one question from a preset list of
   **at least 10** and gives a **one-word** answer. Matching ignores letter case.
4. **Release by inactivity.** The owner sets how many **months** of no activity before the legacy
   is released. No death certificate, no admin review.
5. **First-person chat.** The memorial chat replies **as the owner**, in first person, and should
   feel like talking to them: it inherits their **language, typing pattern, and how they would
   respond** if alive — not just their data.
6. Mockups approved: Legacy page (owner + inheritor views), unlock screen, chat v2
   (`.superpowers/brainstorm/2911-1794916278/content/legacy-page.html`, `legacy-chat.html`,
   `legacy-chat-v2.html`).

## Goals

- Owner: enable Legacy, set months, add/remove inheritors with question + answer, choose what each
  inheritor receives, see how their voice was captured, preview their memorial chat.
- Inheritor: accept/decline requests, see legacies (locked/released), unlock with the answer,
  browse shared memories, chat with the owner's memorial Echo.
- Protection that a stolen inheritor login alone cannot defeat: the answer is never readable by
  anyone, guesses are rate-limited, and everything is enforced by Firestore rules, not the client.

## Non-goals (v1)

- Death certificates, admin review, multi-contact confirmation.
- Push or email notifications to someone who isn't using the app (no server push/email exists today).
- Sending the inheritor's chat back into the owner's 2nd Brain.
- Voice-call (spoken) memorial; text chat only.
- Inheritors exporting or editing the owner's data.

## Anti-goals (a failure even if it "works")

- The memorial **invents memories** the owner never left.
- The answer (or its hash) is readable by the inheritor or anyone else.
- An inheritor sees a **countdown** to the owner's release.
- Health data reaches an inheritor the owner didn't share it with.
- The chat hides that it is an AI: a small permanent line stays under the name.

## How it works

### Activity and release

- `users/{uid}/legacy/settings`: `{ enabled, releaseAfterMinutes, lastActiveAt, createdAt, updatedAt }`.
  Owner-only. `lastActiveAt` must equal `request.time` on write.
- The owner's client stamps `lastActiveAt` on app open, on window focus, and on each chat send,
  throttled to at most once per hour. Only signed-in, foreground use of the web app counts — this
  includes the Android app and floating Echo wherever they show the web app. Native-only actions
  (tapping Done/Snooze on a notification, automatic check-ins) do **not** count in v1; they would
  need Java changes and an Android release.
- `users/{uid}/legacy/beacon`: `{ ownerName, updatedAt }`, written by the owner when Legacy is
  enabled. Readable by an accepted inheritor **only while Released** — reading it is how the
  inheritor's client tells Locked from Released (and drives the badge/banner) without spending a
  guess. It reveals that a release happened, never when it will.
- UI offers months 1–24 (stored as `months × 30 × 1440` minutes). **Demo mode:** when
  `NEXT_PUBLIC_LEGACY_DEMO=1`, the picker also offers "5 minutes" so release can be shown at the
  thesis defense. Rules accept any `releaseAfterMinutes` from 5 to 1,051,200 (24 months).
- **Released(owner)** = `enabled && request.time > lastActiveAt + duration.value(releaseAfterMinutes, 'm')`,
  evaluated inside rules. Because it is computed live, **if the owner comes back, the next activity
  stamp re-locks the legacy automatically.** This is the v1 safety net against false releases.
- Warnings before release: on the owner's Legacy page, a line "If you don't open Echo for N months,
  your legacy is released." No push/email warnings in v1 (non-goal; see above).

### Finding an inheritor by email

- `userDirectory/{emailLowercase}`: `{ uid, displayName }`. Each user writes their own entry on
  sign-in; the rule requires `request.auth.token.email.lower() == emailId`,
  `request.auth.token.email_verified == true`, and `uid == request.auth.uid`.
  Readable only by single-document `get` (no `list`), so the directory cannot be enumerated.
- Google sign-in emails are already verified. Email/password users see a "Verify your email so
  people can add you as an inheritor" prompt on the Legacy page (`sendEmailVerification`).
  Requiring verification stops someone pre-registering another person's email.
- If no entry exists: "No Echo account uses that email yet. Ask them to sign up first."

### Link, question, answer

- `legacyLinks/{ownerUid}_{inheritorUid}` (deterministic id):
  `{ ownerUid, inheritorUid, ownerName, inheritorName, inheritorEmail, status: 'pending'|'accepted',
  questionId, shared: string[], createdAt, updatedAt }`.
  - Owner creates (status `pending`), may update `questionId`/`shared`, may delete.
  - Inheritor may update only `status` from `pending` to `accepted`, and may delete (decline/leave).
  - Both can read. Max 5 inheritors per owner (enforced in the UI).
- `legacySecrets/{linkId}`: `{ answerHash }`. Owner may create/update/delete/get. **No inheritor or other user may read it.**
  Rules use `get()` on it, which bypasses read permission.
- **Preset questions** (stable ids, never reorder; at least 12):
  first pet's name · nickname I called you · city we first met · my favorite food · my first job ·
  my favorite color · our favorite trip destination · my favorite movie · my elementary school ·
  my favorite song · street I grew up on · what I always ordered at our favorite place.
- **Answer rules:** trimmed, one word (letters, digits, apostrophe, hyphen; no spaces), 1–40 chars,
  Unicode NFC, then `toLowerCase()` (not `toLocaleLowerCase()`, which differs by device locale). `answerHash = SHA-256_hex(linkId + ':' + normalized)`
  computed client-side with WebCrypto. Same function hashes guesses.

### Unlocking

- `legacyAttempts/{linkId}`: `{ count, windowStart, guessHash, lastAt }`. Only the link's
  inheritor writes it, and only while the owner is Released. Every guess — right or wrong — is an
  accepted, counted write; the rule never compares the hash on write (doing so would let denied
  writes reveal the answer for free). The owner may delete it.
  - Create: `count == 1`, `windowStart == request.time`.
  - Update: if `request.time > windowStart + 24h` → reset (`count == 1`, `windowStart == request.time`);
    else `count == old + 1` and `count <= 5`.
  - Readable by the inheritor and the owner. The owner's Legacy page shows "N wrong tries from
    <name>" when `guessHash != answerHash` (the owner's client reads both), so a returning owner sees misuse.
- **Unlocked(owner, inheritor)** = link `accepted` && Released(owner) && `attempts.guessHash == secrets.answerHash` (compared in rules at read time).
- After writing a guess, the inheritor's client tries to read `legacy/profile`; success means correct.
- **Removal and re-adding:** removing an inheritor deletes the link, secret and attempts in one
  batch (owner may delete all three). An inheritor leaving deletes only the link; the owner's
  client deletes any stale attempts doc before creating a new link for the same person, so a
  re-added inheritor always has to answer again.
- **Turning Legacy off** closes all access immediately (Released requires `enabled`). The
  inheritor's own chat history stays in their space but they can't continue the chat.

### What the inheritor can read

The owner picks per inheritor which kinds to share (`shared` on the link). Kinds and default:

| Kind | Collections | Default |
|---|---|---|
| `life` | memories of type person, interest, topic, trait, connector, task, diary | on |
| `goals` | goal memories + `goals` | on |
| `notes` | `notes` | on |
| `diary` | `diaryPages` only (titles, previews, dates). **Not** the raw messages, which mix in health talk. | on |
| `health` | health memories + `healthLogs` + `meals` | **off** |

Plus, whenever Unlocked: `users/{uid}/legacy/profile` and `users/{uid}/legacy/voice`.
`legacy/profile` is a copy the owner's client writes with only `{ displayName, preferredName,
importantPeople, tone, language, updatedAt }` (rules can't hide fields of `users/{uid}`, which also
holds email and health goals, so that doc stays owner-only). It is refreshed whenever the owner's
profile changes or Legacy is enabled.

Each shared read rule becomes `isOwner(uid) || (unlocked(uid) && shares(uid, '<kind>'))`. For
`memories`, the rule spells the allowed types out explicitly per kind (e.g.
`resource.data.type == 'goal' && shares(uid, 'goals')`), and the inheritor's client runs **one
`where('type', '==', X)` query per allowed type** so Firestore can prove each query.

### Voice profile (how the owner talks)

- `users/{uid}/legacy/voice`: `{ summary, samples: string[] (≤ 25, each ≤ 300 chars),
  nicknames: {person, nickname}[] (≤ 20), language, builtAt }`. Owner writes; inheritor reads when Unlocked.
- Built while the owner is alive: when Legacy is enabled and the voice doc is missing or older than
  7 days, the owner's client gathers up to 300 of the owner's own typed lines (`role == 'user'`)
  from recent diary pages and posts them to **`POST /api/legacy/voice`** (verifyUser). Gemini returns
  JSON: `summary` (language mix, capitalization, laughter, punctuation, emoji, pet phrases, message
  rhythm, how they react when someone is happy/sad), `samples` (casual, non-sensitive lines that show
  the style), `nicknames`. The prompt tells Gemini to leave out health, medical, money and other
  private details from both summary and samples. The owner's Legacy page shows the summary and
  samples, lets the owner **remove any sample**, and has a **Rebuild** button.
- The voice doc is readable by every Unlocked inheritor regardless of `shared`. Without it the chat
  can't sound like the owner, which is the core of the feature.

### Memorial chat

- **`POST /api/legacy/chat`** (verifyUser). Body: owner name, voice profile, memory context the
  client read from the owner's shared data (same caps style as `buildContext`), the inheritor's name,
  the last 20 turns, the new message. Gemini responds with JSON `{ bubbles: string[] }` (1–4 bubbles).
- System prompt rules: speak as the owner, first person, in their language and typing style, using
  the nickname for this inheritor when known; use **only** provided memories and profile; when
  something isn't there, say so in character (e.g. "hala parang di ko yan naikwento kay echo 😅");
  never invent events, people, dates; if sincerely asked whether this is really them, answer
  honestly, gently, in character, that this is Echo carrying their memories; no medical, legal or
  financial advice.
- History: `users/{inheritorUid}/legacyChats/{ownerUid}/messages/{id}` `{ role, text, createdAt }`,
  in the inheritor's own space only.
- UI (approved v2 mockup): messenger-style header with the owner's name and initial avatar, the line
  "✨ remembered by Echo · tap for info" (info sheet explains it is an AI built from what they shared),
  bubbles appear one by one with a short "typing…" delay, plus a **Browse memories** view of the
  shared items (read-only).
- **Owner preview:** the owner can open "Talk to my legacy" to chat with their own memorial using
  their own data. Preview messages are not stored.

### Legacy page and navigation

- New nav item **Legacy** in the sidebar ("Mind" group) and wherever the sidebar's pages appear on
  mobile. Badge = pending requests + newly released legacies.
- Owner section: enable toggle, months picker, the activity line, My inheritors (name, email,
  status, wrong-try note, edit question/shared, remove), Add an inheritor (email, question picker,
  one-word answer with live validation, shared kinds), voice profile card, Talk to my legacy.
- Inheritor section: Requests (accept/decline), My legacies (🔒 Locked · active / 🔓 Released →
  unlock screen → chat + browse). Locked shows no countdown.
- The inheritor learns of a release **in-app**: the Legacy badge and a one-time banner on the
  home screen. (My call; no push/email in v1.)

### Rules deployment

Per the project's standing rule, `firestore.rules` is deployed before app code that writes the new
docs. New rules ship with emulator-free unit tests for the pure helpers; rule logic is verified by
the owner/QA in the live app.

## Calls I made (owner should check)

1. Release re-locks automatically if the owner returns.
2. No push/email warnings or release notices in v1; in-app only.
3. Demo mode with a 5-minute option behind `NEXT_PUBLIC_LEGACY_DEMO=1`.
4. Verified email required to be findable as an inheritor.
5. 5 wrong tries per 24 hours; the owner can see wrong tries.
6. Health is off by default; other kinds on.
7. Max 5 inheritors.
8. Owner can preview their memorial chat.
9. Voice profile rebuilt weekly from the owner's own typed lines; samples shown to the owner, who
   can remove any; always shared with unlocked inheritors.
10. Only web-app use (including the Android app's web view) counts as activity; notification taps don't.
11. Diary sharing gives page titles and previews, not raw messages.
12. Inheritors can tell Locked from Released (no countdown), via the beacon doc.
13. Removing an inheritor wipes their attempts, so re-adding requires a fresh answer.

## Left to the builder

Component structure, exact copy, styling within existing Echo UI primitives, Gemini model choice
(follow `app/api/echo/route.ts`), context caps.
