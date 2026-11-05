# Android Phase 2 — Pinned Echo notification: implementation plan

Spec: `docs/superpowers/plans/2026-11-05-android-native-plan.md` (section "Phase 2") plus the user's request of 2026-11-05:
- Pinned in the notification bar, with **Reminders | Goals** tabs.
- Reminders: next 3, each with **✓ Done** and **💤 +15 min**. Changes show on the website.
- Goals: top 3 with progress %; tapping one opens that goal in the app.
- **🎤 Talk** and **✏️ Type** buttons just open the app (phases 3–4 wire them).
- Survives swiping the app away and restarting the phone.
- Prompt to turn off battery optimization (TECNO HiOS kills background apps).
- Toggle in Echo's Settings to turn it on/off.

## Global Constraints
- Native code is **Java** (the app module is Java; no Kotlin plugin is configured). Package `com.echo.app`. minSdk 24, target/compile 36.
- Native code never uses the Firebase Android SDK for data. It uses: Secure Token REST (`https://securetoken.googleapis.com/v1/token?key=<apiKey>`, form body `grant_type=refresh_token&refresh_token=<rt>`, response `id_token`, `refresh_token`, `expires_in` seconds) and Firestore REST (`https://firestore.googleapis.com/v1/projects/<projectId>/databases/(default)/documents/...`, header `Authorization: Bearer <idToken>`).
- Firestore rules: reminder doc keys must be exactly `title, dueAt, done, source, createdAt, updatedAt`; **updates require `updatedAt == request.time` and unchanged `createdAt`**. So every native write goes through `POST .../documents:commit` with one `update` write that has an `updateMask` (only the fields changed) and `updateTransforms: [{fieldPath: "updatedAt", setToServerValue: "REQUEST_TIME"}]`, plus `currentDocument: {exists: true}`.
- Done = `done: true`. Snooze = `dueAt = now + 15 minutes` (RFC 3339 UTC timestampValue).
- Reminders shown: `done == false`, sorted by `dueAt` ascending, first 3 (include overdue ones). Goals shown: sorted by `updatedAt` descending, first 3, progress rounded to integer %.
- Session storage: `EncryptedSharedPreferences` (`androidx.security:security-crypto:1.0.0`). Never log tokens.
- Web side is guarded by `Capacitor.isNativePlatform()` — the website must behave exactly as before in a browser.
- Live site: `https://echo-ai-blue.vercel.app`. In-app deep links are paths like `/?view=Goals&goal=<id>`.
- All network calls off the main thread. No new server code, no Firestore rule changes.
- Build: `cd android && ./gradlew.bat assembleDebug testDebugUnitTest` with `JAVA_HOME=~/.jdks/jdk-21.0.13+9`. Web: `npm test`, `npx tsc --noEmit`, `npm run lint` if present.
- After adding a Capacitor plugin class registered in MainActivity no `cap sync` is needed (local plugin). Do not change `capacitor.config.ts`.

## Task 1: Native data layer (session, tokens, Firestore REST)
Files (create): `android/app/src/main/java/com/echo/app/echo/SessionStore.java`, `TokenProvider.java`, `EchoApi.java`, `Models.java` (or `Reminder.java`/`Goal.java`), `FirestoreJson.java`; tests in `android/app/src/test/java/com/echo/app/echo/FirestoreJsonTest.java`. Modify `android/app/build.gradle` (deps: `androidx.security:security-crypto:1.0.0`, `androidx.work:work-runtime:2.10.0`; `testImplementation 'org.json:json:20240303'` so org.json works in JVM tests).
- `SessionStore`: save/load/clear `{uid, refreshToken, apiKey, projectId}`, plus cached `idToken` + `idTokenExpiresAtMs`, plus `pinned` (bool, default false), `tab` ("reminders"|"goals", default "reminders"), `batteryPrompted` (bool). Single static `get(Context)`.
- `TokenProvider.getIdToken(ctx)`: returns cached token if >2 min left, else refreshes via Secure Token REST, stores the rotated refresh token and new id token. On HTTP 400 (revoked/invalid) clear the session and return null.
- `FirestoreJson` (pure, unit-tested): `parseReminders(String listJson) -> List<Reminder>` (id = last path segment of `name`, title, dueAtMs, done), `parseGoals(String) -> List<Goal>` (id, title, progress double from integerValue or doubleValue, updatedAtMs), `pickNextReminders(list, 3)`, `pickTopGoals(list, 3)`, `buildUpdateCommit(docPath, Map fields) -> String` producing the commit body described in Global Constraints. Fields support boolean and timestamp (ms → RFC 3339 UTC with `Z`).
- `EchoApi`: `listReminders()`, `listGoals()` (GET collection with `pageSize=100`; reminders also fine to filter client-side), `markDone(id)`, `snooze(id)` (now+15 min). Uses `HttpURLConnection`, 15 s timeouts, returns null/false on failure without throwing to callers.
- Tests: parsing sample Firestore list JSON (including missing fields, empty `{}` response with no `documents` key), picking/sorting, commit body shape (updateMask fieldPaths, updateTransforms, currentDocument.exists, timestamp format).

## Task 2: EchoBridge plugin + web wiring
Files: create `android/app/src/main/java/com/echo/app/echo/EchoBridgePlugin.java` (`@CapacitorPlugin(name = "EchoBridge")`), modify `MainActivity.java` (`registerPlugin(EchoBridgePlugin.class)` before `super.onCreate`); create `lib/native/echo-bridge.ts`; modify `lib/auth-context.tsx`, `components/echo/settings.tsx`.
- Plugin methods: `setSession({uid, refreshToken, apiKey, projectId})`, `clearSession()` (also stops the notification service), `setPinned({pinned})`, `getStatus() -> {pinned, notificationsAllowed, batteryOptimized}`, `refresh()` (asks the service to reload if running), `requestNotificationPermission()`, `openBatterySettings()`. For Task 2, methods that depend on the service (Task 3/4) may call a `PinnedController` with stubbed bodies, filled in Task 3/4 — but `setSession`/`clearSession`/`getStatus` must be real.
- `lib/native/echo-bridge.ts`: `registerPlugin('EchoBridge')` typed interface; helper functions that no-op off native.
- `auth-context.tsx`: on `onAuthStateChanged` with a user on native → `setSession({uid, refreshToken: user.refreshToken, apiKey: firebase config apiKey, projectId})`; on sign-out → `clearSession()`. Errors swallowed (`.catch(() => null)`).
- Settings: new Card "Phone notification" rendered only on native: Switch "Pinned Echo notification" (hint: "Keep Reminders and Goals in your notification bar."), state from `getStatus()`. Turning on: request notification permission first; if denied show warning Alert and stay off; then `setPinned(true)`; then if `batteryOptimized` show an Alert with a button "Turn off battery optimization" → `openBatterySettings()` and hint text "TECNO/HiOS may close Echo in the background otherwise."
- Also: when the page becomes hidden (`visibilitychange` → hidden) on native, call `refresh()` so edits made in the app show in the notification. Put this in the auth-context effect or a tiny hook.
- Web tests (vitest) for `echo-bridge.ts` no-op behaviour off native if practical.

## Task 3: Foreground service + notification UI + actions
Files: create `EchoNotificationService.java`, `NotificationRenderer.java`, `ActionReceiver.java`, `PinnedController.java` (if not done in Task 2), layouts `res/layout/notif_pinned.xml` (expanded) and `notif_pinned_small.xml` (collapsed), small icon `res/drawable/ic_stat_echo.xml` (simple white vector); modify `AndroidManifest.xml`, `MainActivity.java`.
- Manifest: `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_SPECIAL_USE`, `POST_NOTIFICATIONS`; service `android:foregroundServiceType="specialUse"` with `<property android:name="android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE" android:value="Pinned personal assistant panel with reminders and goals"/>`, `exported=false`; receiver for actions `exported=false`.
- Channel `echo_pinned`, importance LOW, no sound/badge. Notification: ongoing, `setOnlyAlertOnce`, `setCustomContentView(small)` + `setCustomBigContentView(expanded)`, `DecoratedCustomViewStyle`, content intent opens the app.
- Expanded layout: two tab buttons "Reminders" | "Goals" (selected one visually distinct); 3 rows. Reminders row: title + due time (e.g. "Today 3:00 PM", "Overdue · Tue 9:00 AM") + "✓ Done" + "💤 +15m". Goals row: title + "NN%" (+ a ProgressBar if RemoteViews allows; ProgressBar is allowed). Empty states: "No upcoming reminders" / "No goals yet". Footer: "🎤 Talk" and "✏️ Type" open the app (Type → `/?view=Diary`; Talk → `/?view=Diary`). Goal row tap → app at `/?view=Goals&goal=<id>`. Signed-out: single line "Sign in to Echo to see reminders" tapping opens app.
- Every PendingIntent `FLAG_IMMUTABLE` with unique request codes per row/action.
- `ActionReceiver`: actions TAB_REMINDERS, TAB_GOALS (save tab, re-render from cache, no network), DONE(id), SNOOZE(id) → `goAsync()`, run `EchoApi` on a background thread, then trigger refresh; on failure keep state and re-render.
- Service: `onStartCommand` → `startForeground` immediately with cached/placeholder content (must be within 5 s), then load data on a single background executor and update. `START_STICKY`. Caches last lists in memory (and optionally prefs) so tab switches are instant.
- `MainActivity`: read intent extra `echo_path` in `onCreate`/`onNewIntent` and load `<server url> + path` in the WebView (`getBridge().getWebView().loadUrl(...)` on the UI thread; derive the server URL from the bridge, fall back to the live site constant).
- `PinnedController.setPinned(ctx, bool)`: saves pref; true → `ContextCompat.startForegroundService`; false → stop service and cancel notification. `refresh(ctx)`: if pinned and session present, send refresh intent to the service.

## Task 4: Survive swipe-away/reboot, periodic refresh, permissions
Files: create `BootReceiver.java`, `RefreshWorker.java`; modify manifest, `EchoBridgePlugin.java`, `PinnedController.java`, service.
- `RECEIVE_BOOT_COMPLETED` + receiver for `BOOT_COMPLETED` and `MY_PACKAGE_REPLACED` → if pinned and session present, start the service.
- `RefreshWorker` (WorkManager periodic 15 min, unique name `echo-pinned-refresh`, `KEEP`, network-connected constraint) → if pinned, restarts/refreshes the service; enqueued on setPinned(true) and boot, cancelled on setPinned(false)/clearSession.
- Service `onTaskRemoved` → keep running (do not stop self); reschedule a restart via the worker if killed.
- `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` permission; `openBatterySettings()` launches `ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` with `package:com.echo.app` (fallback `ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS`); `getStatus().batteryOptimized` from `PowerManager.isIgnoringBatteryOptimizations`.
- `requestNotificationPermission()`: Android 13+ request `POST_NOTIFICATIONS` via Capacitor permission API (declare alias in `@CapacitorPlugin(permissions=...)`), resolve `{granted}`; below 13 resolve granted from `NotificationManagerCompat.areNotificationsEnabled()`.

## Task 5: Deep link to a goal on the web
Files: modify `components/echo/shell.tsx` (pass `?goal=` through), `components/echo/goals-view.tsx`.
- When the URL has `view=Goals&goal=<id>`, GoalsView scrolls that goal card into view and highlights it briefly (ring for ~2 s), and ensures it is visible even if the current period filter would hide it (switch the filter to one that includes it, or show it regardless). Remove `goal` from the URL afterwards (`history.replaceState`) as the shell already does for `view`.
- Test if there is an existing pure helper pattern; otherwise keep the logic small.

## Verification (user, on phone)
Build + install debug APK, enable toggle, check tabs, Done/Snooze reflected on the website, goal tap deep link, swipe app away, reboot.
