# Chathead check-ins (Android)

Status: draft for the owner's review, 2026-11-06.

## Why

The pinned notification only lists things. It never starts a conversation. The owner wants Echo to come to the user: the chathead pops up by itself through the day, asks about the things Echo tracks, and keeps the user aware of today. It builds on the "use Echo without opening the app" goal from the professor, and it answers "Echo never speaks first".

Success: during waking hours, with no action from the user, a short message appears beside the bubble at the chosen gap. It is relevant to what is still missing today, it appears instantly, and answering it feels like normal Echo chat.

## What the user experiences

### The moment it fires

1. A small message slides out beside the bubble, on the side away from the screen edge. It shows Echo's name and a short question, cut to fit.
2. It vanishes after 1 second (owner's decision). It never blocks touches on the app underneath.
3. The red number on the bubble goes up by one, like a Messenger chathead.
4. Tapping the bubble opens the chat panel. All of the messages are there in full, and the number clears. The user answers there like any Echo chat.

The small message and the bubble match the approved mockup: `.superpowers/brainstorm/1410-1793934683/content/chathead-flow.html` (A is the chosen sleep look).

Firing is silent: no sound and no vibration (builder's default, marked as my call).

### What it says

Each check-in asks about one thing. The full chat message is that question plus a one-line overview of today. "Daily goals" means this overview, not the Goals page and not a new kind of goal.

- Small message: `Had lunch yet?`
- Chat message: `Had lunch yet? So far today: 3 of 8 glasses, 540 kcal, energy not logged. Next up: Dentist at 5 PM.`

The question is picked in this order, using only what is still missing today:

1. A reminder due before the next check-in.
2. A meal that should have happened by now and is not logged (only when calorie tracking is on).
3. Water that is behind pace for the time of day.
4. Mood not logged today.
5. Energy not logged today.
6. Calories compared with the goal, when a goal is set and it is worth mentioning.
7. Nothing missing: a friendly overview of the day.

The same topic should not be asked twice in a row unless nothing else applies. Wording comes from a small set of fixed templates. No AI writes these messages.

The overview line includes water against the water target, calories (only if tracking is on), mood and energy if logged, reminders left today with the next one, and a mention of a long-term goal only if the builder finds it useful. It leaves out anything turned off.

### Sleep time

Between the sleep start and end times nothing fires. A bubble that is still on screen turns into the dozing look: grey, faded, with a small "z z". It can still be tapped to open chat, and it keeps its number. When sleep time ends it wakes up. Nothing missed overnight piles up: there is only one check-in after waking, at the first moment the phone is in use.

### Removing the bubble

Dragging the bubble to the X removes it.

- Messages already sent stay in the chat inside the app.
- New check-ins keep arriving in the chat quietly, with no pop-up, but never during sleep time, and at most one unread quiet check-in at a time. Nothing more is added until the user comes back and reads it (owner's decision). Timing can be looser here.
- The bubble stays gone, across reboots and app opens, until the user taps Type on the pinned notification or turns the setting off and on.
- When it returns, the number shows what is still unread.

### When it stays quiet

Nothing pops up when:

- the user is in a call (`FloatState.callRunning`, `appCallActive`, `callFinishing`)
- the full Echo app is on screen
- the screen is off or the phone is locked

In these cases the check-in waits and fires as soon as the condition clears, as long as it is not sleep time. If the panel is already open the message simply appears in chat and the number does not change. Only one check-in can be waiting; they never stack.

The gap is measured from the last check-in. Signed-out users get nothing.

## Settings

New card in Settings, "Echo check-ins", shown only in the Android app (`isNative`), next to "Phone notification". Saved on the user's profile so they survive reinstall.

| Setting | Default | Notes |
|---|---|---|
| Check-ins on or off | On | Off removes the bubble's auto-firing. It does not delete messages. |
| Message me every | 2 hours | Choices: 30 min, 1, 2, 3, 4, 6 hours (my call). |
| Sleep time | 10:00 PM to 7:00 AM | Can cross midnight. |

Water target: editable on the Health page beside the water figure, default 8 glasses, whole numbers 1 to 30 (range is my call). It replaces the fixed `WATER_TARGET` in `lib/echo/body-fill.ts`, and it applies on the web too. Past days use the current target.

"On by default" means an absent profile field reads as on. Existing users get the feature with the update, except anyone who answered no to "Remind me to check in" in onboarding (`remindersEnabled: false`): for them an absent field reads as off, and they can turn it on in Settings (my call). The onboarding steps do not change. `checkInTime` is a separate, older setting and keeps its current job.

### Display over other apps

Android does not let an app grant itself this. After sign-in and onboarding, the full app shows a one-time explanation with a button that opens the Android setting. If the user declines, check-ins still go to the chat quietly (same path as a removed bubble), and the Settings card shows that the permission is needed, with a button. Echo does not keep nagging.

The same card shows the existing battery optimization and TECNO auto-start advice when the bubble needs it, not just when pinned.

## How it works (decided)

- **Android native does the firing.** The question is chosen on the phone with no AI call and no web page involved. This is what keeps it fast.
- **The bubble stays resident.** `ChatheadService` keeps running with its window on screen all day. Its own timer handles firing while the screen is on, and a screen-unlock listener catches anything that came due while the screen was off. This avoids the exact-alarm permission, which is not granted by default on Android 14 and up, and avoids asking Android for a background start at fire time.
- **Why resident:** the app targets SDK 36, and on Android 15 an app can only start a foreground service from the background if it has the overlay permission and an overlay window is already visible. `RefreshWorker` runs every 15 minutes at best and can be delayed, so it is not good enough to fire on time.
- **Started from a visible moment.** The bubble starts when the full app opens (signed in, onboarded, check-ins on, permission given, not removed), on boot and on app update (`BootReceiver`), and from Type on the notification.
- **Coming back after a kill.** Today the bubble never restarts (`START_NOT_STICKY`, "a killed bubble must not come back by itself"). That has to change for check-ins, but a removed bubble must still stay removed. Android's documented route is to show the overlay window first, then start the service. See the first milestone.
- **Quiet path.** `RefreshWorker` also runs when check-ins are on, even if the notification is not pinned. When the bubble is not running and a check-in is due, it writes the check-in to the chat and adds to the unread number, unless it is sleep time or an unread quiet check-in is already there. The same limit applies to a user who declined the overlay permission.
- **Chat writes.** Native writes the message to today's diary page over the Firestore REST API (`EchoApi`), as an `assistant` message with category `general` and a new marker, `checkIn: true`. It uses the same today's page the panel picks (`pickTodayPage`: most recently updated page created today, local time), creating one with the default title (`Fri, Nov 6` style) if needed. The page update sets `updatedAt` as server request time, but leaves `preview` and `messageCount` alone, so an unanswered check-in does not change how the page looks in the list. The write must not delay the small message.
- **Retries must not double-send.** The last-fired time is stored on the device; a retried write reuses the same document id. Echo assumes one phone per user, so two phones on one account each run their own check-ins, and a reinstall resets the gap (my call).
- **Offline.** With no network, a check-in does not fire; it waits like the other quiet cases. If a chat write still fails after the pop-up, the message is kept in one saved slot on the device and written when the network returns, so the panel always holds what the bubble announced (my call).
- **Days the user never touched (owner's decision).** A day only counts once the user replies. A page holding only check-ins must not mark the day as used in `weekStrip` (`lib/echo/sidebar.ts`) or create a 2nd Brain orb (`lib/echo/orbs.ts`). Leaving `messageCount` at 0 should cover both, and the builder must confirm that, including how such a page behaves in the diary list. Unanswered check-ins still show in the chat.
- **Chat context.** Unanswered check-ins are left out of the last 10 messages sent to the router, so they can't push out real conversation. The exception is the newest check-in, which stays in so that "Yes, adobo" after "Had lunch yet?" is understood and logs a meal. No new AI code is needed.
- **Unread number.** Stored on the device. Goes up on each check-in, clears when the panel opens or when the full app shows the Diary. Shows `9+` above nine (my call).
- **Sign-out** stops the bubble and clears the number and cached data for that user.

### Web changes

- `hasUserMessage` in `components/echo/home.tsx` decides whether the welcome orb shows. A page holding only check-ins must show those messages first, in the panel and the full app. This is required, or the user taps the bubble and may not see the message.
- Settings card, Health water target, and a bridge call so setting changes reach native at once.
- `lib/echo/app-guide.ts` gets a line about check-ins, and the Reminders wording stays honest about what alerts.
- Native also reads the settings from the profile so it is right after a reboot.

### Data and rules

New optional profile fields: `checkInsEnabled` (bool), `checkInEveryMinutes` (int, one of the choices), `sleepStart` and `sleepEnd` (`HH:MM`), `waterGoal` (int, 1 to 30). Page messages get an optional `checkIn` bool, added to `validPageMessage`, and the `Message` type in `lib/firestore.ts`. Both rules use `hasOnly`, so **the rules must be deployed before the web app and the new APK ship**, or these writes fail. Absent fields mean the defaults.

Native needs new `EchoApi` reads: profile, today's health log, today's meals, today's page. Reminders and goals exist already.

## Latency

The owner asked for latency to be checked. Measure it on the real phone (TECNO CM5, Android 15), not just reason about it.

| What | Target |
|---|---|
| Check-in due to small message visible, screen on | under 1 second |
| Phone unlocked to small message visible, when one is waiting | under 2 seconds |
| Tap bubble to panel showing the messages, panel already warmed | under 1 second |
| Tap bubble to panel showing the messages, cold | measure and report; reduce as far as is reasonable |

These targets are my proposal. Nothing has been measured yet.

How:

- Fetch today's data a few minutes before a check-in is due, so firing only reads memory. If the data is stale after an unlock, refresh with a short cap and fall back to the cached copy. It is better to ask a slightly stale question than to be late.
- The panel's cold load is expected to be the slowest part, since it loads the web app from Vercel in a new WebView. Warm it after a check-in fires so a tap is quick, within sensible memory limits. The builder decides how long it stays warm.
- Add timing logs under one tag, `CheckInTiming`: data fetch, due to visible, chat write, tap to panel readable (the page reports ready through the `EchoFloat` bridge). Report real numbers to the owner from the phone.
- Also watch battery: a resident bubble with a timer should be close to idle between check-ins.

## Non-goals

- iPhone or web pop-ups.
- Real reminder alarms at the exact due time. A reminder is only mentioned at a check-in. That remains a separate feature.
- Answering from the small message itself (no quick buttons). All answers happen in chat.
- Editing Goals, or adding a new daily-goal type.

## Anti-goals (a failure even if it works)

- Pop-ups during sleep time or during a call.
- A removed bubble coming back by itself.
- Messages stacking up after a period away.
- Asking something already logged today, when the data was available.
- Slowing the phone down, or a crash in the bubble taking down the app.
- Spending AI quota just to fire a check-in.

## Order of work and risks

1. **Phone test first.** Nothing about the floating features has a long track record on the TECNO. Before building it all, prove on the phone that the bubble survives a day with the screen on and off, and find out what happens after HiOS kills it, including whether "show the overlay, then start the service" works from `RefreshWorker`. If it cannot come back reliably, the fallback is that the quiet path keeps working and the bubble returns the next time the app or notification is opened.
2. Rules, then web, then native. Deploy rules before web. Web must work with older APKs that know nothing of the new bridge call.
3. Release as a new APK version using the normal process (bump `versionCode` in `android/app/build.gradle`, currently 5 / 1.4, then `scripts/release-android.sh`).

Android 12+ blocks touches through opaque overlays, so check on the phone that the small message and bubble don't interfere with the app below.

## Left to the builder

- Exact template wording and how many variations.
- What counts as "behind pace" for water and "should have eaten by now" for meals.
- Animation details, and how the dozing bubble is drawn (keep the mockup's look).
- Code structure. Keep the choosing logic in a pure, unit-tested Java class like `FloatLaunchDecision`. The sleep window across midnight, the priority order and the quiet rules all need tests.
