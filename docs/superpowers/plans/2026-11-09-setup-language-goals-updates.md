# Welcome Setup, Language, Goals Pace and Update Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship these changes with 1.14: a goals card people can read, 12-hour wake times, a preferred language for Echo, all permissions asked once in welcome steps (with device location used for weather), and new app versions announced in a notification.

**Architecture:** Web (Next.js + Firestore) carries the UI, the profile field and the prompts. The Android shell (Capacitor + Java) adds bridge permission methods, a location permission, 12-hour times for Settings, and a background update notifier run by the existing `RefreshWorker`. It all ships in the unreleased 1.14 (versionCode 15 is already bumped on `main`, a81794d, not pushed).

**Tech Stack:** Next.js (read `node_modules/next/dist/docs/` before touching Next APIs, per AGENTS.md), TypeScript, vitest, Firestore rules, Capacitor 7 Android, Java, JUnit, WorkManager.

**Spec:** Owner's requests of 2026-11-09 (this conversation), with these rulings:
- Goals: the outer/inner ring is unclear. Use **one ring** for goals done, with a plain "time gone" bar and sentence, and **make both percentages follow the period filter** (day, week, month, year).
- Settings: "Last wake" and "Next wake" in **12-hour** time.
- **Preferred language** in Settings. The choices are the most used languages Echo supports, Philippine languages included. It changes **Echo's words only** (chat replies, check-ins, voice calls, greetings); menus and buttons stay English.
- **Location permission** for more accurate weather.
- **Every permission is asked after install in welcome steps:** notifications, microphone, location, display over other apps. The chathead (check-ins) is on by default.
- **New updates also appear as a notification**, so the user can update without opening the app first.

## Global Constraints

- Branch: `feat/setup-language-goals` off `main` (a81794d). Merge to main only after all tasks pass; do not push or release (the owner deploys).
- `firestore.rules` changes deploy before web/APK ([[rules-deploy-order]]). Task 3 changes rules: call it out in the final report.
- Web-only changes go live through Vercel. Native changes ship in APK 1.14 (versionCode 15, already set); do not bump again.
- Before merging, run `npx vitest run`, `cd android && ./gradlew :app:testDebugUnitTest`, and `npx next build`. `next build` rewrites `tsconfig.json`: restore it afterwards (`git checkout tsconfig.json`).
- No adb and no device checks; QA tests the live app.
- Copy is a friend's voice: short and plain, no jargon. Never say "logging" or "tracking" in check-in text.
- Older APKs must keep working with the new web: guard every new bridge method (`try/catch`, or a missing result means "unsupported").
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A permission denied twice (Android stops showing the pop-up):** the step must not loop or freeze. It shows "Open settings" (app details page) and still lets the user continue. Test in Task 6 (`permission-setup` helpers: `nextStep` skips denied steps).
2. **The user comes back from the overlay settings page:** the state must refresh on return (app `resume`), or the step stays stuck on "Allow". Test in Task 6 (`refreshOnResume` wiring through `stepStatus`).
3. **Weather was disconnected on purpose, or a city was picked by hand:** device location must never reconnect or overwrite it. Test in Task 7 (`weatherAction` returns `none` for a disconnected doc and for a named city).
4. **An update notification for a version that is already installed, or the same version every 15 minutes:** notify once per versionCode, and cancel it once installed. Test in Task 8 (`UpdateNotifier.shouldNotify`).
5. **The "Today" period on the goals card:** goals done % must use the goals listed for the period, and with none listed show "No goals in this period yet" with no NaN. Test in Task 2 (`paceLine` with 0 goals, `periodElapsed('today')` at 00:00 and 23:59).

---

### Task 1: 12-hour wake times in Settings

**Files:**
- Modify: `android/app/src/main/java/com/echo/app/floating/CheckInRules.java:107-119` (`clock`, `when`)
- Test: `android/app/src/test/java/com/echo/app/floating/CheckInRulesTest.java:329-349`

**Interfaces:**
- Produces: `static String clock(int minuteOfDay)` now returns `"12:05 AM"`, `"9:30 AM"`, `"6:40 PM"`; `when(...)` returns `"6:40 PM"`, `"Sat 7:00 AM"`, `"Nov 13 7:00 AM"`. `CheckInAlarm.nextWake/lastWake` pick this up unchanged.

- [ ] **Step 1: Update the tests** at lines 329-349 to the new expected values: `clock(5)` → `"12:05 AM"`, `clock(9*60+30)` → `"9:30 AM"`, `clock(18*60+40)` → `"6:40 PM"`, `clock(12*60)` → `"12:00 PM"`; `when` cases → `"6:40 PM"`, `"Sat 7:00 AM"`, `"Thu 11:50 PM"`, `"Nov 13 7:00 AM"`.
- [ ] **Step 2: Run** `cd android && ./gradlew :app:testDebugUnitTest --tests "*CheckInRulesTest*"`. Expected: FAIL on the clock/when asserts.
- [ ] **Step 3: Implement** `clock` as 12-hour, `h:mm AM/PM`, hour 0 → 12, Locale.ROOT, minutes always 2 digits. `when` keeps its day/date prefix logic.
- [ ] **Step 4: Run** the same command. Expected: PASS. Then run the whole unit suite and check no other test depended on 24-hour output.
- [ ] **Step 5: Commit** `feat(settings): last and next wake in 12-hour time`.

### Task 2: Goals card with one ring that follows the period

**Files:**
- Modify: `lib/echo/period.ts` (add `'year'` to `Period`, `PERIOD_OPTIONS`, `periodRange`; add `periodElapsed`)
- Modify: `lib/echo/goals-helpers.ts` (add `paceLine`; remove `yearProgress` if it has no other users, with its tests)
- Modify: `components/echo/goals-view.tsx:25-60, 240-300` (ring and card)
- Test: `lib/echo/period.test.ts`, `lib/echo/goals-helpers.test.ts`

**Interfaces:**
- Produces: `type Period = 'today' | 'week' | 'month' | 'year' | 'all'`; `PERIOD_OPTIONS` = Today, This week, This month, **This year**, All (in that order). Other pages using `PERIOD_OPTIONS` get "This year" for free via `periodRange`.
- Produces: `periodElapsed(period: Period, now: Date): number`, an integer 0-100 for how much of the period has passed (calendar day, Monday-start week, month, year; `'all'` uses the year).
- Produces: `paceLine(goalsPct: number, elapsedPct: number, period: Period, goalCount: number): string`.

- [ ] **Step 1: Write the failing tests.**
  - `periodElapsed('today', 2026-11-09 00:00)` → 0; at 12:00 → 50; at 23:59 → 100 (rounded).
  - `periodElapsed('week', Mon 2026-11-09 00:00)` → 0; `periodElapsed('month', 2026-11-16 00:00)` → 50 (15 of 30 days).
  - `periodElapsed('year', 2026-07-02 12:00)` ≈ 50; `periodElapsed('all', d) === periodElapsed('year', d)`.
  - `periodRange('year', 2026-11-09)` → Jan 1 2026 to Jan 1 2027 (local).
  - `PERIOD_OPTIONS` labels: `['Today', 'This week', 'This month', 'This year', 'All']`.
  - `paceLine(0, 40, 'today', 0)` → `'No goals in this period yet.'`
  - `paceLine(40, 85, 'month', 3)` → `"40% done, 85% of this month gone. A bit behind, one small step today helps."`
  - `paceLine(60, 55, 'week', 2)` → `"60% done, 55% of this week gone. You're on track."`
  - `paceLine(90, 50, 'year', 4)` → `"90% done, 50% of this year gone. You're ahead, nice!"`
  - Ruling: behind when goals < elapsed − 10, ahead when goals > elapsed + 10, on track otherwise. Period words: today → "today", week → "this week", month → "this month", year/all → "this year".
- [ ] **Step 2: Run** `npx vitest run lib/echo/period.test.ts lib/echo/goals-helpers.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `periodElapsed` from `periodRange` (`(now - start) / (end - start)`, clamped, rounded) and `paceLine` with the exact copy above.
- [ ] **Step 4: Rework the card in `goals-view.tsx`.** `OverallRing` takes `{ pct: number }` and draws one ring (goal color, the current outer ring style). Its aria-label is `Goals ${pct}% done`. Beside it: the heading `{pct}% of your goals done`, then a thin bar (`h-1.5 rounded-full`, primary color) labelled `Time gone {periodWord}: {elapsed}%`, then `paceLine(...)` in muted text. Remove the "Outer ring… Inner ring…" line. `goalsPct = overallProgress(shown)` (the goals in the selected period, not all goals). `elapsed = periodElapsed(period, now)`.
- [ ] **Step 5: Run** `npx vitest run`. Expected: PASS (fix any test that listed the old `PERIOD_OPTIONS`).
- [ ] **Step 6: Commit** `feat(goals): one ring that follows the period, with a plain pace line`.

### Task 3: Preferred language setting (data, rules, Settings UI)

**Files:**
- Create: `lib/echo/languages.ts`
- Modify: `lib/firestore.ts` (`UserProfile.language?: LanguageCode`, `updateLanguage`)
- Modify: `firestore.rules:51-70` (`validProfile`: allow optional `language`)
- Modify: `components/echo/settings.tsx:419-431` (Profile card)
- Test: `lib/echo/languages.test.ts`

**Interfaces:**
- Produces in `lib/echo/languages.ts`:
  - `LANGUAGES: readonly { code: LanguageCode; label: string; promptName: string }[]`, in this order (first is the default):
    `en` English · `fil` Filipino (Tagalog) · `taglish` Taglish · `ceb` Cebuano (Bisaya) · `ilo` Ilocano · `hil` Hiligaynon (Ilonggo) · `es` Español · `zh` 中文 (Mandarin) · `hi` हिन्दी (Hindi) · `ar` العربية (Arabic) · `pt` Português · `fr` Français · `ja` 日本語 · `ko` 한국어 · `id` Bahasa Indonesia · `vi` Tiếng Việt · `de` Deutsch.
    `promptName` is the English name the model reads, e.g. `'Filipino (Tagalog)'`, `'Taglish (natural Tagalog-English mix, as Filipinos text)'`.
  - `type LanguageCode` (the union of those codes); `DEFAULT_LANGUAGE: LanguageCode = 'en'`.
  - `languageCode(v: unknown): LanguageCode` returns the code if valid, else `'en'`.
  - `languagePromptName(code: LanguageCode): string`.
- Produces in `lib/firestore.ts`: `updateLanguage(uid: string, code: LanguageCode): Promise<void>` writes `{ language, updatedAt }` to the profile with merge, like the existing settings writers.
- Rules: add `'language'` to `hasOnly`, and `(!('language' in d) || d.language in [<the 17 codes>])`.

- [ ] **Step 1: Write the failing tests.** `LANGUAGES[0].code === 'en'`; there are 17 codes and they are unique; `languageCode('fil') === 'fil'`; `languageCode('xx') === 'en'`; `languageCode(undefined) === 'en'`; `languagePromptName('taglish')` contains `'Taglish'`.
- [ ] **Step 2: Run** `npx vitest run lib/echo/languages.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `languages.ts`, `updateLanguage`, the rules change and the `UserProfile` type.
- [ ] **Step 4: Settings UI.** In the Profile card, add a row "Echo's language" with a `Select` (the existing `./ui` Select) listing each `label`. Value is `languageCode(profile.language)`, and on change it calls `updateLanguage`. Helper text below: "Echo talks to you in this language. Menus stay in English." Show the same "Saved" / error pattern the check-in settings use.
- [ ] **Step 5: Run** `npx vitest run`. Expected: PASS.
- [ ] **Step 6: Commit** `feat(settings): preferred language for Echo (rules change: deploy rules first)`.

### Task 4: Echo speaks the chosen language (chat, voice, check-ins)

**Files:**
- Modify: `lib/echo/context.ts:20-45` (`ProfileInput.language`, `buildProfileSummary` adds `Language: <promptName>` when not English)
- Modify: `lib/echo/prompt.ts:45` area and `lib/server/live.ts` system rules (a language rule)
- Modify: `lib/echo/check-in-prompt.ts` (`language` field: parse, prompt line, system rule)
- Modify: `android/app/src/main/java/com/echo/app/echo/CheckInPrefs.java` (`public String language;` with JSON round trip)
- Modify: `android/app/src/main/java/com/echo/app/echo/FirestoreJson.java:196-200` (read `language` beside `tone`)
- Modify: `android/app/src/main/java/com/echo/app/floating/SmartCheckIns.java:240` (send `language` beside `tone`)
- Test: `lib/echo/context.test.ts`, `lib/echo/prompt.test.ts`, `lib/echo/check-in-prompt.test.ts`, `android/.../echo/FirestoreJsonTest.java`, `android/.../echo/CheckInPrefsTest.java`, `android/.../floating/SmartCheckInsTest.java`

**Interfaces:**
- Consumes: `languageCode`, `languagePromptName` from Task 3.
- Produces: the profile summary line `Language: Filipino (Tagalog)` (absent for English). `CheckInRequest.language: string` (prompt name, clipped to 80 characters, `''` when absent). The phone sends the **code**, and the server maps it with `languagePromptName(languageCode(code))`.
- Rule text for chat and live (exact): `- Language: if the profile has a "Language" line, always reply in that language, even when the user writes in English, unless they ask you to switch. Keep names, food and item titles as the user wrote them. Saved item fields (reminder titles, notes) stay in the user's own words.`
- Rule text for check-ins (exact): `- Write fullText and shortText in the language given under Language (default English).` The user text gets the line `Language: <promptName>`.
- Known gap (accepted, list in the final report): the phone's template check-ins (used when the AI fails), the "About 540 kcal — logged as breakfast." prefix, and the pinned notification stay English.

- [ ] **Step 1: Write the failing tests.**
  - `buildProfileSummary({ language: 'fil' })` contains `'Language: Filipino (Tagalog)'`, and `{ language: 'en' }` has no Language line.
  - `buildSystemPrompt`/the exported chat prompt string contains `'always reply in that language'`. Do the same in the live prompt test (`lib/server/live.test.ts`).
  - `parseCheckInRequest({...base, language: 'ceb'}).language` contains `'Cebuano'`; a missing value gives `''`; `buildCheckInUserText` contains `'Language: Cebuano'`.
  - Java: `FirestoreJson` profile parse reads `language` `"fil"`; `CheckInPrefs` JSON round trip keeps `language`; `SmartCheckIns.buildRequest` puts `"language":"fil"` when set and leaves it out when null.
- [ ] **Step 2: Run** both suites. Expected: FAIL.
- [ ] **Step 3: Implement.** Pass `profile.language` wherever `buildContext(profile, …)` takes the profile (`components/echo/home.tsx:500, 637` already pass the whole profile; check that the `ProfileInput` type accepts it).
- [ ] **Step 4: Run** `npx vitest run` and `./gradlew :app:testDebugUnitTest`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(echo): reply, call and check in using the preferred language`.

### Task 5: Native permission bridge (mic, location, overlay, status)

**Files:**
- Modify: `android/app/src/main/AndroidManifest.xml:89-108` (add `ACCESS_COARSE_LOCATION` and `ACCESS_FINE_LOCATION`)
- Modify: `android/app/src/main/java/com/echo/app/echo/EchoBridgePlugin.java:25-28, 177-215` (aliases and methods)
- Modify: `android/app/src/main/java/com/echo/app/MainActivity.java:33, 80-92` (remove `askForMicOnFirstLaunch`; the welcome steps ask instead)
- Modify: `lib/native/echo-bridge.ts` (typed wrappers)
- Test: `lib/native/echo-bridge.permissions.test.ts` (mock `registerPlugin` as `echo-bridge.check-ins.test.ts` does)

**Interfaces:**
- Plugin aliases: `notifications` (exists), `microphone` → `RECORD_AUDIO`, `location` → `ACCESS_COARSE_LOCATION` + `ACCESS_FINE_LOCATION`.
- New plugin methods:
  - `getPermissions()` resolves `{ notifications: boolean, microphone: boolean, location: boolean, overlay: boolean, canAskMicrophone: boolean, canAskLocation: boolean, canAskNotifications: boolean }`. A `canAsk*` value is false when Android will no longer show the pop-up: denied and `shouldShowRequestPermissionRationale` false after a first ask. Track "asked once" per alias in SharedPreferences `echo_app`.
  - `requestMicrophonePermission()` / `requestLocationPermission()` resolve `{ granted: boolean }` (`requestPermissionForAlias` with a `@PermissionCallback`, the same shape as `requestNotificationPermission`).
  - `openAppSettings()` opens `Settings.ACTION_APPLICATION_DETAILS_SETTINGS` for the package.
- TS: `export type NativePermissions = {…same fields…}`; `getNativePermissions(): Promise<NativePermissions | null>` (null on web or an older APK); `requestNativeMicrophone(): Promise<boolean>`; `requestNativeLocation(): Promise<boolean>`; `openNativeAppSettings(): Promise<void>`. Existing: `requestNativeNotificationPermission`, `openOverlaySettings`.
- Capacitor's `BridgeWebChromeClient` grants `navigator.geolocation` to the WebView once the manifest declares location and the permission is granted. Check this in `node_modules/@capacitor/android/capacitor/src/main/java/com/getcapacitor/BridgeWebChromeClient.java` and note what you find in the commit message.

- [ ] **Step 1: Write the failing TS tests.** `getNativePermissions()` returns null when not native; returns the plugin's object when native; returns null when the plugin throws (an older APK). `requestNativeLocation()` returns false when the plugin throws.
- [ ] **Step 2: Run** `npx vitest run lib/native/echo-bridge.permissions.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the manifest change, the plugin aliases and methods, the TS wrappers, and remove the first-launch mic request from `MainActivity`.
- [ ] **Step 4: Run** `npx vitest run`, `./gradlew :app:testDebugUnitTest` and `./gradlew :app:assembleDebug`. Expected: PASS / BUILD SUCCESSFUL.
- [ ] **Step 5: Commit** `feat(android): bridge for mic, location and overlay permissions`.

### Task 6: Welcome steps that ask every permission once

**Files:**
- Create: `lib/echo/permission-setup.ts` (pure step logic)
- Create: `components/echo/permission-setup.tsx` (the full-screen steps)
- Modify: `components/echo/shell.tsx:167` (mount it; hold back `CheckInsPrompt`'s overlay dialog while setup is unfinished)
- Modify: `components/echo/check-ins-prompt.tsx` (no overlay dialog once setup is done, since setup owns that question now; keep the settings sync)
- Modify: `components/echo/settings.tsx` (native-only button "Set up permissions" that reopens the steps)
- Test: `lib/echo/permission-setup.test.ts`

**Interfaces:**
- Consumes: Task 5 wrappers.
- Produces in `lib/echo/permission-setup.ts`:
  - `type SetupStep = 'notifications' | 'microphone' | 'location' | 'overlay' | 'done'`, in that order.
  - `STEP_COPY: Record<Exclude<SetupStep,'done'>, { title: string; why: string }>` with this exact copy:
    - notifications: "Notifications" / "So Echo can check in on you and show your reminders, even when the app is closed."
    - microphone: "Microphone" / "So you can talk to Echo and make voice calls."
    - location: "Location" / "So Echo knows your local weather. Only your rough area is used."
    - overlay: "Show Echo over other apps" / "So Echo's chathead can pop up with a quick check-in. Android opens a settings page: turn on Echo, then come back."
  - `stepStatus(step, perms: NativePermissions): 'granted' | 'ask' | 'blocked'` returns `blocked` when not granted and `canAsk*` is false (`overlay` is never blocked, it always opens settings).
  - `nextStep(perms: NativePermissions, skipped: SetupStep[]): SetupStep` is the first step that is not granted and not skipped, else `'done'`.
  - `shouldShowSetup(s: { isNative: boolean; embed: boolean; onboarded: boolean; done: boolean; perms: NativePermissions | null }): boolean` is true only on native, not embedded, onboarded, not done, perms known, and at least one not granted.
  - Storage key `echo.setup.permissionsDone` (localStorage with try/catch, the same pattern as `check-ins-prompt.tsx`). It is cleared on uninstall, so a fresh install sees the steps. Existing users see them once after updating.
- UI: a full-screen sheet over the app. A progress dot per step; title; `why`; buttons **Allow** (calls the request or opens overlay settings) and **Not now** (adds the step to skipped). A blocked step shows **Open settings** (`openNativeAppSettings`) instead of Allow. Re-read `getNativePermissions()` on Capacitor `App` `resume` and on `visibilitychange`. The last screen says "You're all set. Echo's chathead is on." with a **Done** button. Done stores the flag, and if check-ins are off it calls `updateCheckInSettings(uid, { enabled: true })` (on by default per the owner).

- [ ] **Step 1: Write the failing tests.** Cover `nextStep` order (all denied → `'notifications'`; notifications granted → `'microphone'`; microphone skipped → `'location'`; all granted → `'done'`); `stepStatus` blocked when `canAskMicrophone` is false and not granted; overlay never blocked; `shouldShowSetup` false on web, false when embedded, false before onboarding, false when all granted, true otherwise.
- [ ] **Step 2: Run** `npx vitest run lib/echo/permission-setup.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the logic, the component, the shell mount, the `CheckInsPrompt` hold-back and the Settings button.
- [ ] **Step 4: Run** `npx vitest run`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(app): welcome steps ask for every permission once`.

### Task 7: Weather from the device location

**Files:**
- Create: `lib/echo/weather-location.ts`
- Modify: `components/echo/shell.tsx` (run the sync on app open and on `resume`, native only, when location is granted)
- Modify: `components/echo/permission-setup.tsx` (run the sync right after location is granted)
- Test: `lib/echo/weather-location.test.ts`

**Interfaces:**
- Consumes: `setWeatherLocation(uid, {place, lat, lon})` and `roundCoord` (existing), `getNativePermissions` (Task 5).
- Produces:
  - `AUTO_PLACE = 'Your location'` (the same label the Connectors "Use my location" button already saves, so no rules change).
  - `weatherAction(doc: { connected?: boolean; place?: string; lat?: number; lon?: number } | null, pos: { lat: number; lon: number }): 'connect' | 'update' | 'none'`:
    - `connect`: the doc does not exist (never set up).
    - `update`: connected, `place === AUTO_PLACE`, and rounded coordinates differ from the saved ones.
    - `none`: disconnected on purpose (`connected === false`), a named city chosen by hand, or no change.
  - `syncWeatherLocation(uid: string, deps?: { getDoc, getPosition, save }): Promise<void>` reads the connector doc, gets `navigator.geolocation.getCurrentPosition` (low accuracy, 10 s timeout, 30 min maximumAge), and saves on `connect`/`update`. It never throws, and never logs coordinates.

- [ ] **Step 1: Write the failing tests.** `weatherAction(null, p) === 'connect'`; `{connected:false} → 'none'`; `{connected:true, place:'Manila, Metro Manila', …} → 'none'`; `{connected:true, place:'Your location', lat:14.6, lon:121.0}` with pos `14.6012, 121.0004` → `'none'` (rounds the same); with pos `14.70, 121.0` → `'update'`. `syncWeatherLocation` with an injected failing `getPosition` resolves without saving.
- [ ] **Step 2: Run** `npx vitest run lib/echo/weather-location.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** and wire into the shell and the setup steps.
- [ ] **Step 4: Run** `npx vitest run`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(weather): use the phone's location when allowed`.

### Task 8: Update notifications

**Files:**
- Create: `android/app/src/main/java/com/echo/app/update/UpdateNotifier.java`
- Modify: `android/app/src/main/java/com/echo/app/update/AppUpdater.java` (make `fetch`, `VERSION_URL` and `installedVersionCode` package-visible; add `startFromNotification(Activity)`, which fetches `version.json` and goes straight to `download(activity)` with no dialog)
- Modify: `android/app/src/main/java/com/echo/app/echo/RefreshWorker.java:72-84` (call `UpdateNotifier.maybeNotify(ctx)` in its own try/catch)
- Modify: `android/app/src/main/java/com/echo/app/MainActivity.java` (handle `UpdateNotifier.EXTRA_UPDATE` in `onCreate` and `onNewIntent`: remove the extra, then call `AppUpdater.startFromNotification(this)`)
- Modify: `android/app/src/main/res/values/strings.xml` (channel name and texts)
- Test: `android/app/src/test/java/com/echo/app/update/UpdateNotifierTest.java`

**Interfaces:**
- Produces:
  - `static final String EXTRA_UPDATE = "echo_update"`, `CHANNEL_ID = "echo_updates"` (IMPORTANCE_DEFAULT, name "App updates"), notification id `4201`.
  - `static final long CHECK_EVERY_MS = 6 * 60 * 60_000L`.
  - Pure: `static boolean checkDue(long nowMs, long lastCheckMs)` (true when never checked, after 6 h, or when the clock went backwards); `static boolean shouldNotify(int installedCode, int latestCode, int notifiedCode)` (true when `latestCode > installedCode && latestCode != notifiedCode`); `static boolean shouldCancel(int installedCode, int notifiedCode)` (true when `notifiedCode > 0 && installedCode >= notifiedCode`).
  - `static void maybeNotify(Context ctx)` is blocking and runs on the worker thread. It stores `lastCheckMs` and `notifiedCode` in SharedPreferences `echo_updates`, and does nothing without notification permission.
- Notification: title `Echo {versionName} is ready`; text is the first `changes` line, or `notes`; `BigTextStyle` with up to 3 changes; a tap and the action **Update now** both open `MainActivity` with `EXTRA_UPDATE=true` (`PendingIntent.FLAG_IMMUTABLE | FLAG_UPDATE_CURRENT`); auto-cancel. Opening the app is required: Android blocks starting the installer from the background.

- [ ] **Step 1: Write the failing tests.** `checkDue(0, 0)` true; `checkDue(t, t - 5h)` false; `checkDue(t, t - 6h)` true; `checkDue(t, t + 1h)` true; `shouldNotify(15, 16, 0)` true; `shouldNotify(15, 16, 16)` false; `shouldNotify(16, 16, 0)` false; `shouldCancel(16, 16)` true; `shouldCancel(15, 16)` false; `shouldCancel(16, 0)` false.
- [ ] **Step 2: Run** `./gradlew :app:testDebugUnitTest --tests "*UpdateNotifierTest*"`. Expected: FAIL.
- [ ] **Step 3: Implement** `UpdateNotifier`, the worker hook, the `MainActivity` extra and `AppUpdater.startFromNotification`.
- [ ] **Step 4: Run** `./gradlew :app:testDebugUnitTest` and `./gradlew :app:assembleDebug`. Expected: PASS / BUILD SUCCESSFUL.
- [ ] **Step 5: Commit** `feat(android): new versions show up as a notification`.

### Task 9: Final verification and merge

- [ ] **Step 1:** Run `npx vitest run`. Expected: all pass.
- [ ] **Step 2:** Run `cd android && ./gradlew :app:testDebugUnitTest :app:assembleDebug`. Expected: BUILD SUCCESSFUL.
- [ ] **Step 3:** Run `npx next build`, then `git checkout tsconfig.json`. Expected: build completes.
- [ ] **Step 4:** Whole-branch review, then merge `feat/setup-language-goals` into `main` with `--no-ff`. Do not push.
- [ ] **Step 5:** Report to the owner: deploy order (**rules → push main (web) → `bash scripts/release-android.sh` for 1.14**), suggested release-note lines, and the known English-only gaps from Task 4.
