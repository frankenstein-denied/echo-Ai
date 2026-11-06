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

Every message that reaches the user buzzes (owner's decision): a short double buzz, about 300 ms, with a matching vibration. It uses notification audio, so silent mode, the volume and Do Not Disturb are respected. The bubble's own low-priority service notification stays silent.

### What it says

Each check-in asks about one thing. The full chat message is a greeting, that question, and a one-line overview of today. "Daily goals" means this overview, not the Goals page and not a new kind of goal.

- Small message: `Had lunch yet?`
- Chat message: `Good afternoon! Had lunch yet? What did you eat? So far today: 3 of 8 glasses, 540 kcal, energy not logged. Next up: Dentist at 5 PM.`

The greeting is `Good morning!` before 12:00, `Good afternoon!` from 12:00 to 17:59, and `Good evening!` from 18:00 on. The small message has no greeting, except the overview: `Good afternoon! Here's your day so far`, when that fits in 40 characters.

The question is picked in this order, using only what is still missing today:

1. A reminder due before the next check-in. One on a different day and 12 or more hours away names its day, since a long gap can reach that far and the time alone could read as already past.
2. The meal for this part of the day, if it is not logged (only when calorie tracking is on). Breakfast 07:00 to 10:59, lunch 12:00 to 16:59, dinner 18:00 until sleep. Outside these windows there is no meal question, and an earlier meal is never asked about: at 3 PM with breakfast missing it asks about lunch if that is missing, otherwise it moves on.
3. Water that is behind pace for the time of day.
4. Mood not logged today.
5. Energy not logged today.
6. Calories compared with the goal, when a goal is set and it is worth mentioning.
7. Nothing missing: a friendly overview of the day.

The same topic should not be asked twice in a row unless nothing else applies. Wording comes from a small set of fixed templates. No AI writes these messages.

The overview line includes water against the water target, calories (only if tracking is on), mood and energy if logged, reminders left today with the next one, and a mention of a long-term goal only if the builder finds it useful. It leaves out anything turned off.

### Sleep time

Between the sleep start and end times nothing fires and nothing sounds. A bubble that is still on screen turns into the dozing look: grey, faded, with a small "z z". It can still be tapped to open chat, and it keeps its number. When sleep time ends it wakes up. Nothing missed overnight piles up: there is only one check-in after waking, due the moment sleep ends.

### Removing the bubble

Dragging the bubble to the X removes it.

- Messages already sent stay in the chat inside the app.
- New check-ins keep arriving in the chat quietly, with no pop-up, no notification and no sound, but never during sleep time. Unread check-ins do not stop new ones (owner's decision).
- The bubble stays gone, across reboots and app opens, until the user taps Type on the pinned notification or turns the setting off and on.
- When it returns, the number shows what is still unread.

### How a due check-in reaches the user

After off, sleep, not due, and offline or an unsaved check-in (these wait), the first match wins:

| Situation | What happens |
|---|---|
| In a call (Echo's own: `FloatState.callRunning`, `appCallActive`, `callFinishing`; or a phone or app call, ringing included, seen in `AudioManager.getMode()`), or the full Echo app on screen | Waits, and fires once that clears |
| Panel open, screen on and unlocked | Appears in chat, the number does not change |
| Bubble running, screen on and unlocked | Pop-up: small message, number, buzz |
| Bubble removed by the user | Chat only, silent, number goes up |
| Anything else, including a locked phone (even with the panel left open) or a declined overlay permission | Notification: chat message, number goes up, notification with the buzz |

Only one check-in can be waiting; they never stack. Unread check-ins never hold back the next one.

The notification is on its own channel, `echo_checkins`, at high importance, and has one fixed id, so a new one replaces the last. Tapping it brings the chathead up through Type (a tap is a visible moment), or opens the Diary if the overlay is not allowed. It clears when unread clears.

The gap is measured from the last check-in. Signed-out users get nothing.

## Settings

New card in Settings, "Echo check-ins", shown only in the Android app (`isNative`), next to "Phone notification". Saved on the user's profile so they survive reinstall.

| Setting | Default | Notes |
|---|---|---|
| Check-ins on or off | On | Off removes the bubble's auto-firing. It does not delete messages. |
| Message me every | 2 hours | A whole number plus Minutes, Hours or Days, from 5 minutes to 30 days (owner's decision). Saves on blur, Enter or a unit change. Out of range shows `Choose between 5 minutes and 30 days.` and saves nothing. Stored as whole minutes, 5 to 43200; anything else reads as 120. |
| Sleep time | 10:00 PM to 7:00 AM | Can cross midnight. |

Water target: editable on the Health page beside the water figure, default 8 glasses, whole numbers 1 to 30 (range is my call). It replaces the fixed `WATER_TARGET` in `lib/echo/body-fill.ts`, and it applies on the web too. Past days use the current target.

"On by default" means an absent profile field reads as on. Existing users get the feature with the update, except anyone who answered no to "Remind me to check in" in onboarding (`remindersEnabled: false`): for them an absent field reads as off, and they can turn it on in Settings (my call). The onboarding steps do not change. `checkInTime` is a separate, older setting and keeps its current job.

### Display over other apps

Android does not let an app grant itself this. After sign-in and onboarding, the full app shows a one-time explanation with a button that opens the Android setting. If the user declines, check-ins arrive as notifications, and the Settings card shows that the permission is needed, with a button. Echo does not keep nagging.

The same card keeps the TECNO auto-start and recents-lock advice visible whenever check-ins are on, because a force-stop cancels Echo's alarms and nothing in the app can undo that. The battery optimization button shows while Echo is still optimized. Android 13+ also needs notification permission for the notification path, so it is requested once check-ins are on.

The card shows one muted line, `Bubble: on` or `Bubble isn't running (<reason>)`, so a failed start can be seen without adb. Older APKs report neither field and the line is left out.

## How it works (decided)

- **Android native does the firing.** The question is chosen on the phone with no AI call and no web page involved. This is what keeps it fast.
- **An exact alarm drives firing (owner's decision).** `CheckInAlarm` uses `setExactAndAllowWhileIdle` with `USE_EXACT_ALARM`, which is auto-granted; the app is sideloaded, so Play policy does not apply. It falls back to an inexact alarm on a `SecurityException`. It does not depend on the app being open or a bubble already running. It is set again after every fire and every run, from `RefreshWorker.sync`, on boot and package replaced, and on a settings change, and cancelled on sign-out and when check-ins are off.
- **The next alarm** is the last check-in plus the gap, or sleep end if that falls in sleep. A check-in already due but waiting retries in 5 minutes, so a waiting alarm can't spin. While the bubble is wanted, the alarm also comes no later than 15 minutes from now, day or night, as a keep-alive. In Doze, Android may hold exact alarms back by up to about 15 minutes, so a very short gap can run late with the phone idle and the screen off.
- **The bubble stays resident.** `ChatheadService` keeps running with its window on screen all day, with `stopWithTask="false"`. Its own timer fires while the screen is usable, and a screen-unlock listener catches anything due. With the screen off the timer stops and firing belongs to the alarm. On a locked screen the timer keeps running, so the engine and the alarm can both find a check-in due; only the first to claim it fires.
- **Coming back after a kill.** On every alarm, if the bubble is wanted and not running, it restarts, without firing unless a check-in is due. A swipe from recents also sets a one-off alarm 2 seconds later (`onTaskRemoved`), in case the bubble died with the task. Removed bubbles, signed-out users and check-ins off never restart.
- **How it restarts (`BubbleBringUp`).** Exact alarms are exempt from background start limits, so the alarm calls `startForegroundService` directly. If that fails, outside calls and sleep time, a stand-in bubble is added as an overlay window first, because on Android 15 an app with the overlay permission may start a foreground service from the background only while an overlay window is visible. It comes down once the real head is up. With the screen off that fallback can't work, since the window never becomes visible. Every failure is kept in `lastBubbleError`.
- **Started with no app open.** The bubble also starts when the full app opens (signed in, onboarded, check-ins on, permission given, not removed), and from Type. Boot and package replaced set the alarm and start it from cached prefs, reading the profile first if nothing is cached. If that read fails, the alarm tries again every 15 minutes.
- **What code can't fix.** A force-stop cancels every alarm, and a phone maker may treat a swipe from recents as one. Nothing runs again until the app is next opened. This is why the auto-start advice stays visible.
- **Background path.** `CheckInEngine.onAlarm` and `RefreshWorker` share one background path for anything the engine can't fire. The worker stays as a safety net: it sends what the alarm missed and sets the alarm again, but it does not start the bubble. Whichever of the alarm, worker and engine claims a due check-in first fires it; the others back off. The background path decides again after its data fetch, so a fetch that runs into sleep time or a call sends nothing.
- **Chat writes.** Native writes the message to today's diary page over the Firestore REST API (`EchoApi`), as an `assistant` message with category `general` and a new marker, `checkIn: true`. It uses the same today's page the panel picks (`pickTodayPage`: most recently updated page created today, local time), creating one with the default title (`Fri, Nov 6` style) if needed. The page update sets `updatedAt` as server request time, but leaves `preview` and `messageCount` alone, so an unanswered check-in does not change how the page looks in the list. The write must not delay the small message.
- **Retries must not double-send.** The last-fired time is stored on the device; a retried write reuses the same document id. Echo assumes one phone per user, so two phones on one account each run their own check-ins, and a reinstall resets the gap (my call).
- **Offline.** With no network, a check-in does not fire; it waits like the other quiet cases. If a chat write still fails after the pop-up, the message is kept in one saved slot on the device and written when the network returns, so the panel always holds what the bubble announced (my call).
- **Days the user never touched (owner's decision).** A day only counts once the user replies. A page holding only check-ins must not mark the day as used in `weekStrip` (`lib/echo/sidebar.ts`) or create a 2nd Brain orb (`lib/echo/orbs.ts`). Leaving `messageCount` at 0 should cover both, and the builder must confirm that, including how such a page behaves in the diary list. Unanswered check-ins still show in the chat.
- **Chat context.** Unanswered check-ins are left out of the last 10 messages sent to the router, so they can't push out real conversation. The exception is the newest check-in, which stays in so that "Yes, adobo" after "Had lunch yet?" is understood and logs a meal. No new AI code is needed.
- **Unread number.** Stored on the device. Goes up on each check-in with no cap, clears when the panel opens or when the full app shows the Diary. Shows `9+` above nine (my call).
- **Sign-out** stops the bubble and clears the number and cached data for that user.

### Web changes

- `hasUserMessage` in `components/echo/home.tsx` decides whether the welcome orb shows. A page holding only check-ins must show those messages first, in the panel and the full app. This is required, or the user taps the bubble and may not see the message.
- Settings card, Health water target, and a bridge call so setting changes reach native at once.
- `lib/echo/app-guide.ts` gets a line about check-ins, and the Reminders wording stays honest about what alerts.
- Native also reads the settings from the profile so it is right after a reboot.

### Data and rules

New optional profile fields: `checkInsEnabled` (bool), `checkInEveryMinutes` (int, 5 to 43200), `sleepStart` and `sleepEnd` (`HH:MM`), `waterGoal` (int, 1 to 30). Page messages get an optional `checkIn` bool, added to `validPageMessage`, and the `Message` type in `lib/firestore.ts`. Both rules use `hasOnly`, so **the rules must be deployed before the web app and the new APK ship**, or these writes fail. Absent fields mean the defaults.

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

- Pop-ups, notifications or sound during sleep time, or pop-ups during a call.
- A removed bubble coming back by itself.
- Notifications stacking up after a period away. Chat messages do keep arriving while unread (owner's decision), but the notification replaces itself.
- Asking something already logged today, when the data was available.
- Slowing the phone down, or a crash in the bubble taking down the app.
- Spending AI quota just to fire a check-in.

## Order of work and risks

1. **Phone test first.** Nothing about the floating features has a long track record on the TECNO. Before building it all, prove on the phone that the bubble survives a day with the screen on and off, and find out what happens after HiOS kills it, including whether "show the overlay, then start the service" works from `RefreshWorker`. If it cannot come back reliably, the fallback is that check-ins arrive as notifications and the bubble returns the next time the app or notification is opened.
2. Rules, then web, then native. Deploy rules before web. Web must work with older APKs that know nothing of the new bridge call.
3. Release as a new APK version using the normal process (bump `versionCode` in `android/app/build.gradle`, currently 7 / 1.6, then `scripts/release-android.sh`).

Android 12+ blocks touches through opaque overlays, so check on the phone that the small message and bubble don't interfere with the app below.

## Left to the builder

- Exact template wording and how many variations.
- What counts as "behind pace" for water and "should have eaten by now" for meals.
- Animation details, and how the dozing bubble is drawn (keep the mockup's look).
- Code structure. Keep the choosing logic in a pure, unit-tested Java class like `FloatLaunchDecision`. The sleep window across midnight, the priority order and the quiet rules all need tests.
