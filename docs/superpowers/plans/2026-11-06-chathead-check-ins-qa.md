# Chathead check-ins: QA checklist

Nothing in this feature has run on a phone. From Task 8 on, the code was only compiled: no new tests and no code review, at the owner's request. Expect bugs in Tasks 8 to 10: the timer, the bubble, Settings.

## Before testing

1. Deploy the rules first: `firebase deploy --only firestore:rules`. Without this, settings fail to save and every check-in fails to write.
2. Get the web changes live. The chat panel and Settings load from Vercel, so the APK alone is not enough.
3. Install the APK on the TECNO CM5. Set Message me every to 30 minutes so tests don't take all day.
4. Turn off battery optimization for Echo, allow Auto-start in Phone Master, and lock Echo in recent apps.

## Staying alive (the biggest risk)

Leave the bubble running for 8 hours of normal use, including screen off, a swipe from recents and one reboot.

- [ ] The bubble survives normal use.
- [ ] After a kill, it returns on the next app open.
- [ ] After a reboot, it returns by itself.
- [ ] A phone with no lock screen still fires check-ins.

If HiOS kills the bubble often, tell the owner. A killed bubble stays gone until the next app open, and only quiet check-ins arrive meanwhile. A stronger restart is possible but needs this result first.

## First run

- [ ] New user: the "Let Echo check in" prompt appears once after onboarding, and Allow opens the Android setting.
- [ ] After granting, the bubble appears with no app restart.
- [ ] Cancelling does not prompt again. Settings shows the permission is needed, with a button.
- [ ] A user who answered no to "Remind me to check in" in onboarding starts with check-ins off.

## The moment it fires

- [ ] The small message shows for 1 second and is readable.
- [ ] It sits on the correct side with the bubble on either edge.
- [ ] Touches pass through it to the app underneath.
- [ ] No sound or vibration.
- [ ] The red number goes up, and shows `9+` above nine.
- [ ] Tapping shows all messages in full, and the number clears.
- [ ] Opening the Diary in the full app also clears the number.
- [ ] Replying `Yes, adobo` to `Had lunch yet?` logs a meal.

## What it asks

- [ ] A reminder due before the next check-in comes first.
- [ ] It doesn't ask for something already logged today.
- [ ] It doesn't repeat the same topic twice in a row, unless nothing else is missing.
- [ ] With calorie tracking off, no meal or kcal mentions.
- [ ] The overview uses the water target set on the Health page.

## When it stays quiet

- [ ] Nothing pops up in a call, with Echo open, or at the lock screen.
- [ ] It fires right after the condition clears, and only one fires.
- [ ] Airplane mode: nothing fires until the network returns.

## Sleep

- [ ] Set sleep hours to cover now: the bubble turns grey with "z z", and nothing fires.
- [ ] Tapping the dozing bubble still opens chat.
- [ ] Sleep crossing midnight works. Exactly one check-in comes after sleep ends.

## Removing the bubble

- [ ] Drag to the X, then reboot and open the app: it stays gone.
- [ ] One quiet check-in lands in chat, then no more until it is read, and none during sleep.
- [ ] Tap Type on the notification: the bubble returns with its number.
- [ ] Turning the setting off and on also brings it back.

## Accounts

- [ ] Sign out: the bubble goes.
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

Also check: if every open logs `cold`, the warmed panel isn't loading without a window. And compare Echo's overnight battery use in Android's battery screen.

## Known gaps

- If a chat write keeps failing (for example, rules not deployed), new check-ins are blocked until midnight.
- Turning the setting off leaves a bubble on screen; it just stops firing.
- A new user may only see the bubble on the next app return if they cancel the prompt or already have the permission.
- Older APKs show the Settings card, but it does nothing on the phone.
- The small message is slightly see-through (alpha 0.8), because Android blocks touches through more solid overlays.
- Overdue reminders are never mentioned at a check-in. A reminder that falls between two check-ins can be skipped.
- A reminder early tomorrow can be asked the night before, with no day named.
- Reminder check-ins repeat in the full text: `Your Dentist reminder is at 3:30 PM. ... Next up: Dentist at 3:30 PM.`
