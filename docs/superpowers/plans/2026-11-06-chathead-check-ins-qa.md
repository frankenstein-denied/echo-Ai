# Chathead check-ins: QA checklist

1.5 had one phone test, and check-ins did not reach the user. 1.6 fixes that with an exact alarm, and 1.7 lets the gap be any length from 5 minutes to 30 days. None of it has run on a phone yet. The pure logic has unit tests; the alarm, bubble restart, notification and buzz have only been compiled. Settings shows `Bubble: on` or `Bubble isn't running (<reason>)`: note that line whenever something goes wrong.

## Before testing

1. Deploy the rules first: `firebase deploy --only firestore:rules`. Without this, settings fail to save and every check-in fails to write, and any gap outside the old six choices is refused.
2. Get the web changes live. The chat panel and Settings load from Vercel, so the APK alone is not enough.
3. Install the APK on the TECNO CM5. Set Message me every to 30 minutes so tests don't take all day.
4. Turn off battery optimization for Echo, allow Auto-start in Phone Master, and lock Echo in recent apps.

## Staying alive (the biggest risk)

Leave the bubble running for 8 hours of normal use, including screen off, a swipe from recents and one reboot.

- [ ] The bubble survives normal use.
- [ ] Swipe Echo from recents: the bubble stays, or returns within seconds.
- [ ] Kill it another way: it returns within 15 minutes with no app open, including with the screen off.
- [ ] After a reboot, it returns by itself with the app never opened.
- [ ] After installing the update, it returns by itself with the app never opened.
- [ ] It stays up, dozing, through sleep hours.
- [ ] A phone with no lock screen still fires check-ins.
- [ ] Settings shows `Bubble: on` while it runs, and the reason when it can't.
- [ ] `Last wake` moves on after alarms, and `Next wake` shows a time still ahead. If it is in the past, the alarm was not delivered.
- [ ] A `worker` line with nothing to do doesn't replace an `alarm` line. A wake on another day shows the day, for example `Next wake: Sat 07:00`.
- [ ] Block notifications for Echo: Settings warns about it, and the warning goes once they are allowed.

A force-stop cancels every alarm, and HiOS may treat a swipe from recents as one. If so, nothing runs until the app is next opened, and code can't change that. Tell the owner, and check that Auto-start and the recents lock fix it.

## First run

- [ ] New user: the "Let Echo check in" prompt appears once after onboarding, and Allow opens the Android setting.
- [ ] After granting, the bubble appears with no app restart.
- [ ] Cancelling does not prompt again. Settings shows the permission is needed, with a button.
- [ ] Android asks for notification permission once check-ins are on, even if the notification was never pinned.
- [ ] A user who answered no to "Remind me to check in" in onboarding starts with check-ins off.

## The moment it fires

- [ ] The small message shows for 2.5 seconds and is readable.
- [ ] It sits on the correct side with the bubble on either edge.
- [ ] Touches pass through it to the app underneath.
- [ ] It fires on time at a 30-minute gap, with no app open.
- [ ] The double buzz and vibration play once per message, and aren't harsh.
- [ ] Silent mode: no sound, no vibration. Vibrate mode: vibration only. Do Not Disturb: neither.
- [ ] The red number goes up, and shows `9+` above nine.
- [ ] Tapping shows all messages in full, and the number clears.
- [ ] Opening the Diary in the full app also clears the number.
- [ ] Replying `Yes, adobo` to `Had lunch yet?` logs a meal.

## What it asks

- [ ] A reminder due before the next check-in comes first.
- [ ] It doesn't ask for something already logged today.
- [ ] Meals: breakfast only 07:00 to 10:59, lunch only 12:00 to 16:59, dinner only from 18:00. At 3 PM it never asks about breakfast.
- [ ] Messages read like a friend: one or two sentences, with no stats, no `0 of`, no `not logged`, no `kcal`.
- [ ] Greetings match the time of day. The same line doesn't come twice in a row.
- [ ] Your preferred name appears in about one message in three, and never in the small message. With no name set, the lines still read naturally.
- [ ] Water wording changes with none, some and over halfway.
- [ ] Good morning chat: the first check-in within 2 hours after sleep end asks about sleep and energy, once that day.
- [ ] Good night chat: the first check-in within the last 90 minutes before sleep start asks about energy and winds down, once that day.
- [ ] With energy already logged, neither chat asks about it. Energy is never asked at any other time.
- [ ] Mood is asked only between the two chat windows. Water is never asked in the last hour before sleep.
- [ ] With a bedtime past midnight, the good night chat doesn't come twice. With equal sleep times, neither chat comes.
- [ ] It doesn't repeat the same topic twice in a row, unless nothing else is missing.
- [ ] With calorie tracking off, no meal or food goal mentions.
- [ ] `Over halfway` follows the water target set on the Health page.

## AI-written check-ins (1.12)

Needs the web change (`/api/check-in`) live on Vercel first, with `GEMINI_API_KEY` set. Use a gap of 10 minutes or more: shorter gaps always use the templates.

- [ ] Check-ins mention something real from today: a goal's progress or next step, a reminder coming up, something you said in chat, a meal, your water, your mood or sleep.
- [ ] No generic `How's your day going?` or `How was your day?` unless tied to something specific.
- [ ] No two check-ins in a day say the same thing or nearly the same thing.
- [ ] Still no stats, no `0 of`, no `not logged`, no mention of logging or tracking, no diagnosing.
- [ ] Greetings match the time of day. The name shows up only now and then, never in the small message.
- [ ] Set a tone in the profile (Gentle coach, Direct, Cheerful) and the wording follows it.
- [ ] The small message is at most 40 characters and makes sense on its own.
- [ ] The pop-up is still instant at the due time: logcat shows `ai_used=true ai_ms=0` for most check-ins (the text was fetched 5 minutes ahead).
- [ ] Airplane mode on the server side (or a bad network): the pop-up comes within about 3 seconds with a template line, `ai_used=false`.
- [ ] With the screen off, the notification text is AI-written too (`ai_used=true`, `ai_ms` up to 8000).
- [ ] With a 1 to 9 minute gap, every check-in is a template (`ai_used=false`) and no `ai_request_ms` lines appear.
- [ ] Reminder, meal and morning or night topics still come in the same order as before; the AI only changes the words.
- [ ] Replying to an AI check-in in chat works as before (for example, `Yes, adobo` logs a meal).

## How it reaches you

- [ ] Nothing fires in a call or with Echo open, and it fires after that clears, once only: within about a minute, or about 5 seconds after leaving Echo.
- [ ] Timing doesn't drift: at a 30-minute gap, check-ins stay on the same half-hour grid across a day. One that was held back is followed by the next on that grid, which can be sooner than a full gap.
- [ ] That holds for a phone call, a WhatsApp call, and while either is ringing.
- [ ] Panel open: it appears in chat, with no number and no buzz.
- [ ] Panel left open, phone locked: a notification arrives.
- [ ] Screen off or locked: a notification with the buzz arrives on time, and the check-in is counted.
- [ ] Overlay denied: a notification arrives, and tapping it opens the Diary.
- [ ] Bubble gone (not removed): tapping the notification brings it back with its number.
- [ ] A second notification replaces the first and buzzes again. The number on it goes up.
- [ ] Opening the panel or the Diary clears the notification.
- [ ] Check-ins keep coming while earlier ones are unread.
- [ ] Airplane mode: nothing fires until the network returns.

## Keyboard

- [ ] Full app, Diary: tap the type box. It sits right above the keyboard with no gap, and the tab bar hides.
- [ ] Close the keyboard: the layout returns to normal, with the tab bar back and no gap at the bottom.
- [ ] Other text fields in the full app, such as Settings, stay visible while typing.
- [ ] Chathead panel: tap the type box. The panel ends above the keyboard and the type box is visible.
- [ ] The bubble stays above the panel and can be tapped. If it sat low, it moves up, then returns when the keyboard closes.
- [ ] Close the keyboard: the panel returns to full height. Close the panel with the keyboard open: it reopens at full height.
- [ ] Rotate with the keyboard open in both places, and try the emoji or a taller keyboard.

## Sleep

- [ ] Set sleep hours to cover now: the bubble turns grey with "z z", and nothing fires or sounds.
- [ ] Tapping the dozing bubble still opens chat.
- [ ] Sleep crossing midnight works. Exactly one check-in comes after sleep ends.

## Removing the bubble

- [ ] Drag to the X, then wait for the next check-in: the bubble comes back with the message, buzz and number.
- [ ] During sleep time, a dismissed bubble stays gone until the first check-in after sleep.
- [ ] Opening Echo brings it back at once, and Settings shows `Bubble: on`.
- [ ] Between check-ins, with Echo closed, it stays gone, including across a reboot.
- [ ] Tap Type on the notification: the bubble returns with its number.
- [ ] Turning the setting off and on also brings it back.

## Accounts

- [ ] Sign out: the bubble goes, any check-in notification goes, and it doesn't come back at the keep-alive.
- [ ] Sign in as another user: the number is 0, and the bubble can start.
- [ ] The panel never shows a bubble disappearing by itself while signed in. (A warmed page reporting signed-out would stop it.)

## Chat and diary

- [ ] A page holding only check-ins shows them, not the welcome orb, in the panel and the full app.
- [ ] A day with only check-ins has no 2nd Brain orb and no mark in the sidebar week strip.
- [ ] That page behaves sensibly in the diary list.
- [ ] Leave the panel open past midnight, let a check-in fire, tap the bubble: it shows today's page.
- [ ] First write creates a page, a later write reuses it, and no message is doubled.

## Settings and Health

- [ ] The Echo check-ins card shows only in the Android app.
- [ ] Changing the gap or sleep time takes effect without a restart.
- [ ] Message me every shows a number and a Minutes, Hours or Days select, side by side at phone width.
- [ ] A stored gap opens in its largest whole unit: 120 shows 2 Hours, 1440 shows 1 Day, 90 shows 90 Minutes. The unit names follow the number as it is typed.
- [ ] Nothing saves on leaving the field or changing the unit. Save, or Enter in the box, saves.
- [ ] Save is disabled until the gap differs from the stored one, and shows busy while saving. The same gap in another unit (120 Minutes for 2 Hours) leaves it disabled.
- [ ] After saving, `Saved. Next check-in in about <gap>.` shows for a few seconds, and `Next wake` updates.
- [ ] The first check-in comes one gap after saving. Changing sleep time or the water target doesn't restart the timer.
- [ ] 31 days, 0, an empty box and 1.5 each show `Choose between 1 minute and 30 days.` on Save and save nothing. Fixing the value clears it.
- [ ] Sleep time saves only with its Save button, shows `Saved.`, and rejects equal or empty times.
- [ ] Offline, Save keeps spinning until reconnect (known).
- [ ] 1 minute and 30 days both save and survive reopening Settings.
- [ ] At a 1-minute gap, check-ins arrive about every minute with the screen on, and none in sleep time.
- [ ] At a 2-day gap, the next one comes two days later, or at sleep end if that lands in sleep. The bubble still stays up through the keep-alive.
- [ ] With a 2-day gap, a reminder on another day and 12 or more hours away is named with its day, for example "Dentist on Sat, Nov 7". One due early tomorrow, under 12 hours away, shows the time alone.
- [ ] The Auto-start advice stays visible while check-ins are on.
- [ ] Turning check-ins off stops the alarm: a killed bubble doesn't return.
- [ ] Sleep start equal to sleep end is rejected.
- [ ] The Edit target control on Health fits at phone width and saves. Offline, Save keeps spinning until reconnect (known).

## Latency

The owner asked for this, and the numbers don't exist yet.

Run `adb logcat -d -s CheckInTiming` after at least 10 check-ins and 5 panel opens, cold and warm. Report the median and worst value.

| Log value | What it is | Target |
|---|---|---|
| `due_to_visible_ms` | check-in due to small message visible, screen on | under 1 second |
| `due_to_visible_ms` | unlock to small message visible | under 2 seconds |
| `tap_to_ready_ms` (warm) | tap to panel showing messages | under 1 second |
| `tap_to_ready_ms` (cold) | same, cold | measure and report |
| `fetch_ms`, `write_ms` | data fetch and chat write | for finding slow steps |
| `ai_used`, `ai_ms` | whether the AI's words were used, and how long the pop-up waited for them | `ai_ms` 0 when prefetched, at most 3000 for a pop-up |
| `ai_request_ms` | one AI request: Firestore reads plus the server call | for finding slow steps |

Also check: if every open logs `cold`, the warmed panel isn't loading without a window. And compare Echo's overnight battery use in Android's battery screen: the keep-alive now wakes the phone every 15 minutes, day and night.

## Known gaps

- If a chat write keeps failing (for example, rules not deployed), new check-ins are blocked until midnight.
- A bubble that dies while the screen is off can only return through the exact-alarm start: the overlay fallback needs a screen that is on. It is also skipped in calls and sleep time.
- Denying notification permission leaves the notification path silent. The check-in still reaches the chat.
- Turning the setting off leaves a bubble on screen; it just stops firing.
- With the phone idle and the screen off, Doze may hold the alarm back, so a gap under 15 minutes can run late.
- On 1.6 or older, a gap outside the old six choices shows in Settings but the phone uses its last valid gap, or 2 hours after a profile read, until the APK is updated.
- A 5-minute gap reads Firestore on every check-in and buzzes each time. That is what was asked for, but watch battery and read counts.
- A new user may only see the bubble on the next app return if they cancel the prompt or already have the permission.
- Older APKs show the Settings card, but it does nothing on the phone.
- The small message is slightly see-through (alpha 0.8), because Android blocks touches through more solid overlays.
- Overdue reminders are never mentioned at a check-in. A reminder that falls between two check-ins can be skipped.
- A reminder early tomorrow can be asked the night before, with no day named.
- AI check-ins: the text is kept in memory only, so if Android kills the app between the prefetch and the due time, that check-in asks again at fire time (up to 3 seconds for a pop-up, 8 for a notification) or falls back to the templates.
- AI check-ins: if the planner's topic changes in the 5 minutes between the prefetch and the due time (for example a meal window opens), that check-in uses the templates rather than asking again.
- AI check-ins: the cap is 48 a day per device, counted when a request is sent, failures included.
