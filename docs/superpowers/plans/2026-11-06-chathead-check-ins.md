# Chathead Check-ins Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Android chathead pops up by itself through the day with one short question about what is still missing today, shows a Messenger-style unread number, and dozes during sleep hours.

**Architecture:** `ChatheadService` becomes a resident bubble that owns a `CheckInEngine`: a 60-second timer plus an unlock listener. All decisions and wording live in two pure Java classes (`CheckInRules`, `CheckInPlanner`), so firing needs no AI, no web page and no network wait. Messages go to today's diary page over Firestore REST, marked `checkIn: true`, and `RefreshWorker` runs a capped quiet path when the bubble is not running.

**Tech Stack:** Android Java (Capacitor shell, targetSdk 36, minSdk 24), JUnit 4 with `org.json`, Next.js 16, TypeScript, Vitest, Firestore rules.

**Spec:** `docs/superpowers/specs/2026-11-06-chathead-check-ins-design.md`

## Global Constraints

- Small message: visible for 1 second, never blocks touches, silent (no sound, no vibration).
- Defaults: check-ins on, every 2 hours, sleep 10:00 PM to 7:00 AM, water target 8. Absent fields mean defaults, except `remindersEnabled: false` with `checkInsEnabled` absent reads as off.
- Gap choices (minutes): 30, 60, 120, 180, 240, 360. Water target: whole numbers 1 to 30.
- No AI calls on the firing path. Fixed templates only.
- A removed bubble never returns by itself, across reboots and app opens. Only Type on the notification, or turning the setting off and on, brings it back.
- Quiet check-ins: never in sleep time, at most one unread at a time.
- No popup during a call, with the full Echo app on screen, or with the screen off or locked. The check-in waits; only one can wait.
- Rules deploy before web and APK. The owner runs `firebase deploy --only firestore:rules`.
- Web code must work with older APKs: every new native call is wrapped so a missing method does nothing.
- Read `node_modules/next/dist/docs/` before changing Next.js-specific code (`AGENTS.md`).
- Work on branch `feat/chathead-check-ins`. Do not push to `main` until the owner has deployed rules.
- Web tests: `pnpm vitest run <file>`. Android tests: from `android/`, `./gradlew testDebugUnitTest --tests "<class>"` (needs JDK 21, already set in `~/.gradle/gradle.properties`).

## Review Focus

- A cached snapshot from yesterday after midnight or a time zone change: Echo must not ask from old data (Task 7 `snapshotIsUsable`).
- Sleep start equal to sleep end, and the exact boundary minutes: equal means never asleep; 22:00 is asleep, 07:00 is awake (Task 5).
- A brand new user with no health doc: a 404 means "nothing logged", not a failure, so Echo still asks (Task 7).
- Reboot or app open after the bubble was removed: it stays gone (Task 5 `shouldStartBubble`).
- Very long reminder titles, and old health logs with `mood` but no `moodTag`: the small message stays short, and mood counts as logged (Tasks 6 and 7).

---

### Task 1: Phone test of the resident bubble (gate, needs the owner's phone)

Nothing else on the native side is final until this answers two questions. It is throwaway: do not merge it.

**Files:**
- Create: `docs/superpowers/plans/2026-11-06-chathead-phone-test-results.md`
- Temporary, on branch `spike/resident-bubble`: `ChatheadService.java`, `RefreshWorker.java`

**Interfaces:**
- Produces: the written result "revive path", which Task 9 uses: `overlay-first` or `next-visible-moment`.

- [ ] **Step 1:** On `spike/resident-bubble`, return `START_STICKY` from `ChatheadService.onStartCommand`, log every lifecycle event under tag `BubbleSpike` with timestamps, and in `RefreshWorker.doWork` try the documented route if the bubble is not running: on the main thread add a `TYPE_APPLICATION_OVERLAY` view, confirm `getWindowVisibility() == View.VISIBLE`, then call `ContextCompat.startForegroundService`.
- [ ] **Step 2:** Install on the TECNO CM5 (`adb` serial `138462554Y004657`), start the bubble with Type, and leave it for at least 8 hours of normal use, including screen off, a swipe from recents, and one reboot.
- [ ] **Step 3:** Pull the log with `adb logcat -d -s BubbleSpike` and write down: did the bubble survive, how long did kills take, did the overlay-first restart succeed or throw `ForegroundServiceStartNotAllowedException`, and whether the 60-second `Handler` tick kept running while the screen was on.
- [ ] **Step 4:** Commit only the results file to `feat/chathead-check-ins`, ending with the line `Revive path: overlay-first` or `Revive path: next-visible-moment`. If the bubble cannot be kept alive for hours even with battery optimization off, stop and tell the owner before going on.

```bash
git add docs/superpowers/plans/2026-11-06-chathead-phone-test-results.md
git commit -m "docs: record resident bubble phone test"
```

---

### Task 2: Rules, profile fields and settings helpers

**Files:**
- Modify: `firestore.rules` (`validProfile` at lines 48-72, `validPageMessage` at about line 237)
- Modify: `lib/firestore.ts` (`UserProfile` line 38, `Message` line 66, next to `updateCalorieSettings` line 491)
- Create: `lib/echo/check-ins.ts`, `lib/echo/check-ins.test.ts`

**Interfaces:**
- Produces:
  - `CHECK_IN_GAPS: readonly number[]`, `DEFAULT_WATER_GOAL = 8`
  - `type CheckInSettings = { enabled: boolean; everyMinutes: number; sleepStart: string; sleepEnd: string; waterGoal: number }`
  - `resolveCheckInSettings(p: Partial<Pick<UserProfile, 'checkInsEnabled' | 'checkInEveryMinutes' | 'sleepStart' | 'sleepEnd' | 'waterGoal' | 'remindersEnabled'>>): CheckInSettings`
  - `updateCheckInSettings(uid: string, s: Partial<Omit<CheckInSettings, 'enabled'>> & { enabled?: boolean }): Promise<void>`
  - `watchCheckInSettings(uid: string, onData: (s: CheckInSettings) => void, onError: (e: Error) => void): Unsubscribe`
  - `Message.checkIn?: boolean`

- [ ] **Step 1: Write the failing test** in `lib/echo/check-ins.test.ts`

```ts
it('uses the defaults for an empty profile', () => {
  expect(resolveCheckInSettings({})).toEqual({ enabled: true, everyMinutes: 120, sleepStart: '22:00', sleepEnd: '07:00', waterGoal: 8 })
})
it('starts off for someone who said no in onboarding', () => {
  expect(resolveCheckInSettings({ remindersEnabled: false }).enabled).toBe(false)
  expect(resolveCheckInSettings({ remindersEnabled: false, checkInsEnabled: true }).enabled).toBe(true)
})
it('falls back on bad stored values', () => {
  const s = resolveCheckInSettings({ checkInEveryMinutes: 7, sleepStart: '25:00', waterGoal: 99 })
  expect([s.everyMinutes, s.sleepStart, s.waterGoal]).toEqual([120, '22:00', 8])
})
```

- [ ] **Step 2:** Run `pnpm vitest run lib/echo/check-ins.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3:** Implement `lib/echo/check-ins.ts` and add the optional fields to `UserProfile` and `checkIn` to `Message`. Add `updateCheckInSettings` and `watchCheckInSettings` to `lib/firestore.ts`, following `updateCalorieSettings` and `watchCalorieSettings`.
- [ ] **Step 4:** In `firestore.rules`, add to the `validProfile` `hasOnly` list `checkInsEnabled`, `checkInEveryMinutes`, `sleepStart`, `sleepEnd`, `waterGoal`, each optional: bool; int in `[30, 60, 120, 180, 240, 360]`; string matching the existing `checkInTime` regex (both times); int 1 to 30. Add `checkIn` to the `validPageMessage` `hasOnly` list as an optional bool.
- [ ] **Step 5:** Run `pnpm vitest run lib/echo/check-ins.test.ts`. Expected: PASS.
- [ ] **Step 6: Commit**

```bash
git add firestore.rules lib/firestore.ts lib/echo/check-ins.ts lib/echo/check-ins.test.ts
git commit -m "feat(check-ins): add profile settings and message marker"
```

---

### Task 3: Editable water target on the Health page

**Files:**
- Modify: `lib/echo/body-fill.ts`, `lib/echo/body-fill.test.ts`
- Modify: `components/echo/health-view.tsx` (`TodayBodies` line 84, line 134, `TodayForm` line 168), `components/echo/health/body-strip.tsx` line 23

**Interfaces:**
- Consumes: `DEFAULT_WATER_GOAL`, `watchCheckInSettings`, `updateCheckInSettings` (Task 2)
- Produces: `waterFill(glassCount: number, target?: number)`, with `target` defaulting to `DEFAULT_WATER_GOAL`. `WATER_TARGET` is removed.

- [ ] **Step 1: Write the failing test**

```ts
it('fills against the given target', () => {
  expect(waterFill(5, 10)).toEqual({ level: 0.5, full: false, text: '5 / 10 glasses', sub: '5 to go' })
  expect(waterFill(5).text).toBe('5 / 8 glasses')
})
```

Update the existing tests that import `WATER_TARGET` to use `DEFAULT_WATER_GOAL`.

- [ ] **Step 2:** Run `pnpm vitest run lib/echo/body-fill.test.ts`. Expected: FAIL on `5 / 10`.
- [ ] **Step 3:** Add the `target` parameter. Non-finite or below 1 falls back to the default.
- [ ] **Step 4:** In `health-view.tsx`, read the target with `watchCheckInSettings` next to the calorie watcher at line 383 and pass it to `TodayBodies`, the week view and `body-strip`. Add a small "Edit target" control under the water figure that accepts whole numbers 1 to 30 and saves with `updateCheckInSettings(uid, { waterGoal })`. This shows on the web too.
- [ ] **Step 5:** Run `pnpm vitest run lib/echo/body-fill.test.ts` and `pnpm exec tsc --noEmit`. Expected: PASS, no new type errors.
- [ ] **Step 6: Commit**

```bash
git add lib/echo/body-fill.ts lib/echo/body-fill.test.ts components/echo/health-view.tsx components/echo/health/body-strip.tsx
git commit -m "feat(health): let the user edit the water target"
```

---

### Task 4: Check-ins in the chat

**Files:**
- Modify: `lib/echo/today-orb.ts`, `lib/echo/today-orb.test.ts`
- Modify: `lib/echo/context.ts` (`MessageInput` line 27, `buildContext` line 57), `lib/echo/context.test.ts`
- Modify: `components/echo/home.tsx` (line 788, `ChatMessage` type), `components/echo/diary-view.tsx` (line 315), `lib/echo/diary.ts`, `lib/echo/diary.test.ts`
- Modify: `lib/native/float-bridge.ts`, `android/.../floating/EchoFloatInterface.java`

**Interfaces:**
- Produces:
  - `showTodayWelcome(messages: { role: string; checkIn?: boolean }[] | null | undefined): boolean`
  - `dropUnansweredCheckIns<T extends { role: string; checkIn?: boolean }>(messages: T[]): T[]`
  - `reportPanelReady(): void` in `float-bridge.ts`, calling a new `EchoFloat.onPanelReady()`, and `Listener.onPanelReady()` in Java (Task 9 implements it)

- [ ] **Step 1: Write the failing tests**

```ts
it('hides the welcome once a check-in is on the page', () => {
  expect(showTodayWelcome([{ role: 'assistant' }])).toBe(true) // onboarding welcome message
  expect(showTodayWelcome([{ role: 'assistant', checkIn: true }])).toBe(false)
  expect(showTodayWelcome([{ role: 'user' }])).toBe(false)
})
it('keeps answered check-ins and the newest one only', () => {
  const a = { role: 'assistant', checkIn: true, text: 'a' }
  const u = { role: 'user', text: 'u' }
  const b = { role: 'assistant', checkIn: true, text: 'b' }
  const c = { role: 'assistant', checkIn: true, text: 'c' }
  expect(dropUnansweredCheckIns([a, u, b, c])).toEqual([a, u, c])
})
it('keeps real conversation in the last 10 despite many check-ins', () => {
  const real = Array.from({ length: 10 }, (_, i) => ({ role: 'user' as const, text: `m${i}` }))
  const noise = Array.from({ length: 8 }, () => ({ role: 'assistant' as const, text: 'q', checkIn: true }))
  expect(buildContext({}, [...real, ...noise], []).recentMessages.filter((m) => m.text !== 'q')).toHaveLength(9)
})
```

- [ ] **Step 2:** Run `pnpm vitest run lib/echo/today-orb.test.ts lib/echo/context.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement both helpers. `buildContext` applies `dropUnansweredCheckIns` before its `slice(-RECENT_MAX)`. Keep `hasUserMessage` for its other use.
- [ ] **Step 4:** In `home.tsx`, add `checkIn` to the `ChatMessage` type (the snapshot at line 310 already spreads it through), switch line 788 to `showTodayWelcome(messages)`, and call `reportPanelReady()` once when `embed === 'chat'` and `messages !== null`. Add `onPanelReady` to the Java interface and to `pageListener` in `ChatheadService` and `FloatingCallService` as a no-op for now.
- [ ] **Step 5:** In `components/echo/diary-view.tsx`, the landing effect at line 315 runs once. A floating panel loaded before today's page existed would stay on the empty state and miss the check-in. When `embed` is set, nothing is selected and `pickTodayPage(pages)` finds a page, select it. Pull that decision into `lib/echo/diary.ts` as `embedPageToAdopt<T extends { id: string; createdAt?: { toMillis?: () => number } | null }>(selectedId: string | null, embed: boolean, pages: T[], now?: Date): string | null` with a test: returns the page id only when `embed` is true, `selectedId` is null and a today page exists.
- [ ] **Step 6:** Run `pnpm vitest run lib/echo` and `./gradlew testDebugUnitTest`. Expected: all pass.
- [ ] **Step 7: Commit**

```bash
git add lib/echo/today-orb.ts lib/echo/today-orb.test.ts lib/echo/context.ts lib/echo/context.test.ts lib/echo/diary.ts lib/echo/diary.test.ts components/echo/home.tsx components/echo/diary-view.tsx lib/native/float-bridge.ts android/app/src/main/java
git commit -m "feat(check-ins): show check-ins in chat and keep them out of the way"
```

---

### Task 5: `CheckInRules`, the pure decision class

**Files:**
- Create: `android/app/src/main/java/com/echo/app/floating/CheckInRules.java`
- Test: `android/app/src/test/java/com/echo/app/floating/CheckInRulesTest.java`

**Interfaces:**
- Produces:
  - `enum Outcome { OFF, SLEEPING, NOT_DUE, WAIT, POPUP, CHAT_ONLY, QUIET }`
  - `static boolean inSleep(int minuteOfDay, int startMin, int endMin)`
  - `static Outcome decide(State s)`, where `State` has public fields: `enabled, signedIn, bubbleRunning, screenOn, inCall, appInForeground, online, panelOpen, pendingWrite` (boolean), `nowMs, lastFiredMs` (long), `everyMinutes, minuteOfDay, sleepStartMin, sleepEndMin, quietUnread` (int)
  - `static boolean shouldStartBubble(boolean enabled, boolean signedIn, boolean overlayGranted, boolean removed)`

Order inside `decide`: off or signed out gives `OFF`; asleep gives `SLEEPING`; not due gives `NOT_DUE`; offline or `pendingWrite` gives `WAIT`. If the bubble is running: call, app in front or screen off gives `WAIT`, panel open gives `CHAT_ONLY`, otherwise `POPUP`. If it is not running: `quietUnread >= 1` gives `WAIT`, otherwise `QUIET`.

- [ ] **Step 1: Write the failing test**, in the style of `FloatLaunchDecisionTest`

```java
@Test public void sleepCrossesMidnight() {
    assertTrue(CheckInRules.inSleep(22 * 60, 1320, 420));
    assertTrue(CheckInRules.inSleep(0, 1320, 420));
    assertTrue(CheckInRules.inSleep(419, 1320, 420));
    assertFalse(CheckInRules.inSleep(420, 1320, 420));
    assertFalse(CheckInRules.inSleep(1319, 1320, 420));
}
@Test public void sleepInsideOneDayAndEqualTimes() {
    assertTrue(CheckInRules.inSleep(60, 30, 120));
    assertFalse(CheckInRules.inSleep(600, 600, 600)); // equal means never asleep
}
@Test public void neverFiresWhileAsleepEvenIfOverdue() { /* due, all clear, 23:00 */ assertEquals(SLEEPING, decide(s)); }
@Test public void waitsForCallAppAndLockedScreen() { /* each flag alone gives WAIT */ }
@Test public void offlineWaitsOnBothPaths() { /* online=false, bubble on and off */ }
@Test public void unsavedCheckInBlocksTheNextOne() { /* pendingWrite=true, due, all clear */ assertEquals(WAIT, decide(s)); }
@Test public void panelOpenGoesStraightToChat() { assertEquals(CHAT_ONLY, decide(s)); }
@Test public void quietStopsAtOneUnread() { /* quietUnread 0 gives QUIET, 1 gives WAIT */ }
@Test public void gapIsMeasuredFromLastCheckIn() { /* 119 min NOT_DUE, 120 min POPUP */ }
@Test public void removedBubbleStaysRemoved() {
    assertFalse(CheckInRules.shouldStartBubble(true, true, true, true));
    assertTrue(CheckInRules.shouldStartBubble(true, true, true, false));
    assertFalse(CheckInRules.shouldStartBubble(true, true, false, false));
}
```

- [ ] **Step 2:** Run `./gradlew testDebugUnitTest --tests "com.echo.app.floating.CheckInRulesTest"`. Expected: FAIL, class not found.
- [ ] **Step 3:** Implement `CheckInRules`, with no Android imports.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add android/app/src/main/java/com/echo/app/floating/CheckInRules.java android/app/src/test/java/com/echo/app/floating/CheckInRulesTest.java
git commit -m "feat(android): add check-in decision rules"
```

---

### Task 6: `CheckInPlanner`, what Echo asks

**Files:**
- Create: `android/.../floating/CheckInPlanner.java`, `android/.../floating/TodaySnapshot.java`
- Test: `android/app/src/test/java/com/echo/app/floating/CheckInPlannerTest.java`

**Interfaces:**
- Consumes: `Reminder` (`id, title, dueAtMs, done`)
- Produces:
  - `TodaySnapshot` public fields: `String dateKey; long fetchedAtMs; int waterGlasses; boolean moodLogged, energyLogged, caloriesEnabled; String energy; String moodTag; int kcalToday; Integer calorieGoal; Set<String> mealTypes; List<Reminder> openReminders; int waterGoal`
  - `enum Topic { REMINDER, MEAL, WATER, MOOD, ENERGY, CALORIES, OVERVIEW }`
  - `final class Plan { Topic topic; String shortText; String fullText; }`
  - `static Plan plan(TodaySnapshot s, Topic lastTopic, long nowMs, TimeZone tz, int everyMinutes, int sleepStartMin, int sleepEndMin)`

Fixed values (these replace "left to the builder" in the spec):
- Meals are overdue after breakfast 10:00, lunch 14:00, dinner 20:00, checked latest first, only when `caloriesEnabled`.
- Water is behind when `waterGlasses < floor(waterGoal * minutesSinceWake / wakingMinutes)`.
- Calories is worth mentioning when a goal is set and the day is at 90% or more of it.
- Skip a topic equal to `lastTopic` unless no other applies.

| Topic | `shortText` |
|---|---|
| REMINDER | `{title} at {time}` (title cut to 24 characters with `…`) |
| MEAL | `Had breakfast yet?` / `Had lunch yet?` / `Had dinner yet?` |
| WATER | `Time for some water?` |
| MOOD | `How are you feeling?` |
| ENERGY | `How's your energy?` |
| CALORIES | `{kcal} of {goal} kcal so far` |
| OVERVIEW | `Here's your day so far` |

`fullText` is the question, then the overview: `Had lunch yet? So far today: 3 of 8 glasses, 540 kcal, energy not logged. Next up: Dentist at 5 PM.` Leave out calories when tracking is off, and leave out `Next up` when no reminders remain today. Use the question forms `What did you eat?` after the meal question and `Your {title} reminder is at {time}.` for reminders.

- [ ] **Step 1: Write the failing test**

```java
@Test public void reminderBeforeNextCheckInComesFirst() { /* due in 90 min, gap 120, lunch missing */ assertEquals(Topic.REMINDER, p.topic); }
@Test public void reminderAfterNextCheckInDoesNotCount() { /* due in 3 h, gap 120 */ assertNotEquals(Topic.REMINDER, p.topic); }
@Test public void missingLunchAfterTwo() { /* 14:30, breakfast logged */ assertEquals("Had lunch yet?", p.shortText); }
@Test public void neverAsksMealsWithCaloriesOff() { /* caloriesEnabled false, 14:30 */ assertNotEquals(Topic.MEAL, p.topic); assertFalse(p.fullText.contains("kcal")); }
@Test public void waterPace() { /* goal 8, wake 07:00, sleep 22:00, 14:30: 3 glasses behind, 4 not */ }
@Test public void doesNotRepeatTopic() { /* MOOD and ENERGY missing, lastTopic MOOD */ assertEquals(Topic.ENERGY, p.topic); }
@Test public void repeatsWhenOnlyOneTopicLeft() { /* only MOOD missing, lastTopic MOOD */ assertEquals(Topic.MOOD, p.topic); }
@Test public void everythingLoggedGivesOverview() { assertEquals(Topic.OVERVIEW, p.topic); }
@Test public void fullTextMatchesTheSpec() {
    assertEquals("Had lunch yet? What did you eat? So far today: 3 of 8 glasses, 540 kcal, energy not logged. Next up: Dentist at 5 PM.", p.fullText);
}
@Test public void longReminderTitleStaysShort() { /* 200-char title */ assertTrue(p.shortText.length() <= 40); }
```

- [ ] **Step 2:** Run with `--tests "com.echo.app.floating.CheckInPlannerTest"`. Expected: FAIL.
- [ ] **Step 3:** Implement, with no Android imports.
- [ ] **Step 4:** Run again. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add android/app/src/main/java/com/echo/app/floating android/app/src/test/java/com/echo/app/floating/CheckInPlannerTest.java
git commit -m "feat(android): choose what each check-in asks"
```

---

### Task 7: Native data: reads, writes and stored state

**Files:**
- Modify: `android/.../echo/FirestoreJson.java`, `android/.../echo/EchoApi.java`, `android/.../echo/SessionStore.java`
- Test: `android/app/src/test/java/com/echo/app/echo/FirestoreJsonTest.java`
- Create: `android/.../echo/CheckInPrefs.java`

**Interfaces:**
- Produces in `FirestoreJson`:
  - `static CheckInPrefs parseProfile(String docJson)`
  - `static void applyHealthLog(String docJson, TodaySnapshot s)`, `static void applyMeals(String runQueryJson, TodaySnapshot s)`
  - `static String todaysPageQuery()`, `static String pickTodayPageId(String runQueryJson, long nowMs, TimeZone tz)` (null when none)
  - `static String buildCheckInCommit(String pageDocPath, String messageDocPath, String text, String newPageTitle)` (`newPageTitle` null means the page exists)
  - `static boolean snapshotIsUsable(TodaySnapshot s, String todayKey, long nowMs)`, true when the date matches and it is under 2 hours old
- Produces in `CheckInPrefs`: public fields `enabled, everyMinutes, sleepStartMin, sleepEndMin, waterGoal, caloriesEnabled, calorieGoal` and `static CheckInPrefs defaults()`
- Produces in `EchoApi`: `CheckInPrefs getProfilePrefs()`, `TodaySnapshot loadToday(CheckInPrefs p, TimeZone tz)` (null only on real failure), `boolean writeCheckIn(String messageId, String text, TimeZone tz)`
- Produces in `SessionStore`: getters and setters for `lastFiredMs`, `lastTopic`, `unreadCount`, `quietUnread`, `bubbleRemoved`, `pendingCheckInId`, `pendingCheckInText`, plus `cachedPrefsJson`. `clearSession()` also clears all of these.

- [ ] **Step 1: Write the failing tests** in `FirestoreJsonTest`

```java
@Test public void profileDefaultsAndOnboardingNo() {
    assertTrue(FirestoreJson.parseProfile("{\"fields\":{}}").enabled);
    assertEquals(120, FirestoreJson.parseProfile("{\"fields\":{}}").everyMinutes);
    assertFalse(FirestoreJson.parseProfile("{\"fields\":{\"remindersEnabled\":{\"booleanValue\":false}}}").enabled);
}
@Test public void oldHealthLogWithOnlyMoodCounts() { /* mood integerValue, no moodTag */ assertTrue(s.moodLogged); }
@Test public void checkInCommitLeavesPreviewAlone() {
    // writes[0]: message with role assistant, text, category general, checkIn true, createdAt REQUEST_TIME transform.
    // writes[1]: page, updateMask empty, updatedAt REQUEST_TIME transform; must not contain preview or messageCount.
}
@Test public void checkInCommitCreatesPageWhenNeeded() {
    // title set, preview "", messageCount integerValue "0", currentDocument exists false,
    // createdAt, updatedAt and lastMessageAt all REQUEST_TIME transforms.
}
@Test public void pickTodayPageUsesLocalDay() { /* newest first, created 23:30 yesterday UTC+8 vs today */ }
@Test public void snapshotFromYesterdayIsNotUsable() { assertFalse(FirestoreJson.snapshotIsUsable(s, "2026-11-07", now)); }
@Test public void snapshotOlderThanTwoHoursIsNotUsable() { /* same day, 121 minutes old */ }
```

- [ ] **Step 2:** Run with `--tests "com.echo.app.echo.FirestoreJsonTest"`. Expected: FAIL.
- [ ] **Step 3:** Implement. Date keys use local time (`yyyy-MM-dd`). A page title follows `Fri, Nov 6` (`EEE, MMM d`, `Locale.US`). Do not extend `buildUpdateCommit`; it only handles one doc.
- [ ] **Step 4:** Add the `EchoApi` methods. In `loadToday`, a 404 on the health log means an empty log, not failure. Open reminders reuse `listReminders()`. Set `connectTimeout` and `readTimeout` as `open()` already does.
- [ ] **Step 5:** Run the tests. Expected: PASS.
- [ ] **Step 6: Commit**

```bash
git add android/app/src/main/java/com/echo/app/echo android/app/src/test/java/com/echo/app/echo/FirestoreJsonTest.java
git commit -m "feat(android): read today's data and write check-ins"
```

---

### Task 8: `CheckInEngine`, bridge and quiet path

**Files:**
- Create: `android/.../floating/CheckInEngine.java`
- Modify: `android/.../echo/EchoBridgePlugin.java`, `android/.../echo/RefreshWorker.java`, `android/.../echo/PinnedController.java` (lines 16-28, 53: keep the worker alive for check-ins), `android/.../echo/BootReceiver.java`, `android/.../floating/FloatState.java`, `android/.../MainActivity.java`
- Modify: `lib/native/echo-bridge.ts`

**Interfaces:**
- Consumes: `CheckInRules`, `CheckInPlanner`, `EchoApi`, `SessionStore`
- Produces:
  - `CheckInEngine(Context ctx, Host host)`, with `Host { boolean isPanelOpen(); void showMessage(String shortText); void setUnread(int count); void setDozing(boolean dozing); void warmPanel(); }`
  - `void start()`, `void stop()`, `void onPanelOpened()`, `void reloadPrefs()`
  - `static void runQuietPath(Context ctx)` (blocking, called from `RefreshWorker.doWork`)
  - `FloatState.appInForeground` and `FloatState.bubbleRunning`
  - Bridge methods and TS wrappers: `setCheckInSettings(CheckInSettings)`, `getCheckInStatus(): { overlayAllowed: boolean; bubbleRemoved: boolean; batteryOptimized: boolean }`, `openOverlaySettings()`, `markCheckInsRead()`

Behaviour:
- `start()` seeds `lastFiredMs` to now if it is 0, so nothing fires the moment the feature turns on. It then ticks every 60 seconds on a main-thread `Handler` and registers `ACTION_USER_PRESENT` and `ACTION_SCREEN_OFF` receivers. The tick stops while the screen is off.
- Five minutes before the next check-in, refresh the snapshot on a background thread. On unlock, use the snapshot if `snapshotIsUsable`, otherwise refresh with a 1,500 ms cap and fall back to the cached copy if it is from today.
- On `POPUP`: call `host.showMessage` first, then raise the unread count, store `lastFiredMs` and `lastTopic`, write in the background, and call `host.warmPanel()` only after the write finishes, so the panel finds today's page.
- If `writeCheckIn` fails, retry once with the same message id, then keep it in `pendingCheckIn*` and retry on later ticks. Only one slot exists; pass `pendingWrite=true` to `decide` while it is full, so nothing new fires.
- Each tick calls `host.setDozing(outcome == SLEEPING)`.
- Log under tag `CheckInTiming`: `fetch_ms`, `due_to_visible_ms`, `write_ms`.
- `runQuietPath` does the same with `bubbleRunning=false`, and sets `quietUnread` to 1. `markCheckInsRead` clears both counters.
- `RefreshWorker.schedule` runs when pinned or check-ins are on. `PinnedController.setPinned(false)` and `stop()` no longer cancel it while check-ins are on. Sign-out cancels it.
- `MainActivity.onResume` and `onPause` set `FloatState.appInForeground`. `onResume` also starts the bubble when `shouldStartBubble` is true, using cached prefs. `BootReceiver` does the same check.

- [ ] **Step 1:** Add `CheckInEngineTest` for the one piece of logic worth isolating: `static long msUntilPrefetch(long lastFiredMs, int everyMinutes, long nowMs)`, which returns 0 when already inside the 5-minute window and never a negative number.
- [ ] **Step 2:** Run with `--tests "com.echo.app.floating.CheckInEngineTest"`. Expected: FAIL.
- [ ] **Step 3:** Implement the engine, worker changes and bridge as described. Wrap every new call in `lib/native/echo-bridge.ts` so an older APK resolves quietly, like `isFloatingCallActive`.
- [ ] **Step 4:** Run `./gradlew testDebugUnitTest` and `./gradlew assembleDebug`. Expected: all pass, APK builds.
- [ ] **Step 5: Commit**

```bash
git add android/app/src lib/native/echo-bridge.ts
git commit -m "feat(android): run check-ins on a timer with a quiet fallback"
```

---

### Task 9: The bubble: number, small message, dozing, staying alive

**Files:**
- Modify: `android/.../floating/ChatheadService.java`, `android/.../floating/FloatLaunchActivity.java`, `android/.../floating/ChatheadGeometry.java`, `android/.../echo/EchoBridgePlugin.java` (`clearSession` stops the bubble)
- Create: `android/app/src/main/res/layout/float_head.xml`, `float_message.xml`, `res/drawable/ic_echo_head_sleeping.xml`, `bg_float_badge.xml`, `bg_float_message.xml`
- Modify: `android/app/src/main/res/values/strings.xml`
- Test: `android/app/src/test/java/com/echo/app/floating/ChatheadGeometryTest.java`

**Interfaces:**
- Consumes: `CheckInEngine.Host`, the Task 1 revive path, `Listener.onPanelReady`
- Produces:
  - `static int messageX(int headX, int headSize, int messageWidth, int screenW, int gap)` in `ChatheadGeometry`
  - `static String badgeText(int count)` in `ChatheadGeometry`
  - `ChatheadService.stop(Context)`

Requirements:
- The head becomes a `FrameLayout` from `float_head.xml`, holding the image and the red number. Touch handling moves to it unchanged.
- The small message is its own overlay window with `FLAG_NOT_TOUCHABLE`, placed on the side away from the screen edge, in Echo's name, two lines at most. It slides in over 150 ms, stays 1 second, then is removed.
- Dozing swaps to `ic_echo_head_sleeping` (grey, faded, "z z", as in the mockup). Tap still opens the panel, and the number stays.
- `openPanel` calls `engine.onPanelOpened()`, which clears the number.
- **Split the two ways out.** `teardown()` runs on system kills too, through `onDestroy`. Add `removeByUser()` for the drop on the X, which sets `bubbleRemoved` and then calls `teardown()`. Only this path sets the flag.
- `onStartCommand` returns `START_STICKY`, and on a sticky restart exits if `shouldStartBubble` is false. Apply the Task 1 revive path in `RefreshWorker`.
- `FloatLaunchActivity`, on `SHOW_CHATHEAD`, clears `bubbleRemoved` first. Turning the setting off and on also clears it.
- `warmPanel()` builds `panel` and `web` without adding the windows, only while the screen is on, and drops the WebView after 30 unopened minutes. Log `tap_to_ready_ms` and `cold` or `warm` under `CheckInTiming`, from the tap to `onPanelReady`.
- `onSignedOut` and `clearSession` call `ChatheadService.stop`.
- A small-message failure must never take the service down: catch as the other window code does.

- [ ] **Step 1: Write the failing test**

```java
@Test public void messageSitsAwayFromTheEdge() {
    assertEquals(1080 - 150 - 16 - 400, ChatheadGeometry.messageX(1080 - 150, 150, 400, 1080, 16));
    assertEquals(150 + 16, ChatheadGeometry.messageX(0, 150, 400, 1080, 16));
}
@Test public void badge() {
    assertEquals("", ChatheadGeometry.badgeText(0));
    assertEquals("9", ChatheadGeometry.badgeText(9));
    assertEquals("9+", ChatheadGeometry.badgeText(10));
}
```

- [ ] **Step 2:** Run with `--tests "com.echo.app.floating.ChatheadGeometryTest"`. Expected: FAIL.
- [ ] **Step 3:** Implement the geometry, then the service changes.
- [ ] **Step 4:** Run `./gradlew testDebugUnitTest` and `./gradlew assembleDebug`. Expected: all pass, APK builds.
- [ ] **Step 5: Commit**

```bash
git add android/app/src
git commit -m "feat(android): add the check-in message, unread number and dozing bubble"
```

---

### Task 10: Settings card and first-run permission prompt

**Files:**
- Modify: `components/echo/settings.tsx` (after the "Phone notification" card, line 260), `components/echo/shell.tsx`, `components/echo/diary-view.tsx`, `components/echo/reminders-view.tsx`, `lib/echo/guide.ts`, `lib/echo/app-guide.ts`
- Create: `components/echo/check-ins-prompt.tsx`
- Modify: `lib/echo/check-ins.ts`, `lib/echo/check-ins.test.ts`

**Interfaces:**
- Consumes: `watchCheckInSettings`, `updateCheckInSettings`, and the bridge calls from Task 8
- Produces: `shouldPromptOverlay(s: { isNative: boolean; embed: boolean; onboarded: boolean; enabled: boolean; overlayAllowed: boolean; asked: boolean }): boolean`

- [ ] **Step 1: Write the failing test**

```ts
it('asks once, only in the full Android app', () => {
  const base = { isNative: true, embed: false, onboarded: true, enabled: true, overlayAllowed: false, asked: false }
  expect(shouldPromptOverlay(base)).toBe(true)
  for (const k of [{ isNative: false }, { embed: true }, { onboarded: false }, { enabled: false }, { overlayAllowed: true }, { asked: true }])
    expect(shouldPromptOverlay({ ...base, ...k })).toBe(false)
})
it('tells users about check-ins', () => {
  expect(APP_GUIDE).toMatch(/check-in/i)
})
```

- [ ] **Step 2:** Run `pnpm vitest run lib/echo/check-ins.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Add the "Echo check-ins" card, shown only when `isNative`: on/off switch, a "Message me every" select from `CHECK_IN_GAPS`, and sleep start and end time inputs. Each change saves with `updateCheckInSettings` and sends the new values through `setCheckInSettings`. Reject sleep start equal to sleep end with a short error. Show a warning with a button when `overlayAllowed` is false, and the existing battery and TECNO advice when `batteryOptimized` is true.
- [ ] **Step 4:** Add the one-time prompt in `check-ins-prompt.tsx`, using `ConfirmDialog` from `components/echo/ui/confirm-dialog.tsx` with `confirmLabel="Allow"`, mounted in `shell.tsx`. Copy: title `Let Echo check in`, body `Echo can pop up a short message over your other apps. Android needs you to allow "Display over other apps" once.`. Cancelling counts as asked. Store `asked` in `localStorage` with try/catch.
- [ ] **Step 5:** In `diary-view.tsx`, call `markCheckInsRead()` when the Diary shows in the full app (not embed). Reminders do not ring, so change the `Things Echo will nudge you about, and routines it has learned.` text in `components/echo/reminders-view.tsx:198` and `lib/echo/guide.ts:84` to `Your reminders and routines. On Android, Echo mentions them at check-ins.`. Add one line to `APP_GUIDE`: `- Check-ins (Android): the Echo bubble pops up short check-ins through the day and sleeps at night. Change the gap and sleep time in Settings > Echo check-ins.`
- [ ] **Step 6:** Run `pnpm vitest run` and `pnpm exec tsc --noEmit`. Expected: all pass, no new type errors.
- [ ] **Step 7: Commit**

```bash
git add components/echo lib/echo
git commit -m "feat(check-ins): add settings and the first-run permission prompt"
```

---

### Task 11: Phone check, latency numbers and release (needs the owner)

**Files:**
- Create: `docs/superpowers/plans/2026-11-06-chathead-check-ins-phone-check.md`
- Modify: `android/app/build.gradle` (`versionCode 6`, `versionName "1.5"`)

- [ ] **Step 1:** The owner deploys rules: `firebase deploy --only firestore:rules`. Then deploy the branch to a Vercel preview or merge as the owner chooses. Native loads `https://echo-ai-blue.vercel.app`, so web changes must be live for the panel test.
- [ ] **Step 2:** Install the debug APK on the TECNO with a 30-minute gap. Walk this checklist and record pass or fail for each:
  - Message shows for 1 second, on the correct side after dragging the bubble to both edges, and touches pass through.
  - The number goes up, tapping shows all messages in full, and it clears. It also clears from the Diary in the full app.
  - Reply `Yes, adobo` to `Had lunch yet?`. A meal is logged.
  - Nothing fires in a call, with Echo open, or at the lock screen. It fires right after unlock.
  - Set sleep to cover now. The bubble dozes, nothing fires, tap opens chat. One check-in only after sleep ends.
  - Drag to X. Reboot and open the app: it stays gone. One quiet check-in appears in chat and no more. Tap Type: it returns with its number.
  - Sign out: the bubble goes. Sign in as another user: number is 0.
  - A day with only check-ins has no 2nd Brain orb and is not marked in the sidebar week strip, and the page behaves sensibly in the diary list.
  - Airplane mode: nothing fires until the network returns.
  - Normal use of another app is not affected by the bubble or message.
- [ ] **Step 3:** Collect `adb logcat -d -s CheckInTiming` over at least 10 check-ins and 5 panel opens each, cold and warm. Report median and worst values against the targets: due to visible under 1 s, unlock to visible under 2 s, warm tap to ready under 1 s, and the cold number as measured. If a target is missed, find the slow step from the logs and fix it, or tell the owner the real number.
- [ ] **Step 4:** Compare overnight battery use for Echo in Android's battery screen, and record it.
- [ ] **Step 5:** Bump the version and commit the results.

```bash
git add android/app/build.gradle docs/superpowers/plans/2026-11-06-chathead-check-ins-phone-check.md
git commit -m "chore(android): prepare 1.5 with chathead check-ins"
```

- [ ] **Step 6:** With the owner's go-ahead, merge, push and publish with `scripts/release-android.sh`.
