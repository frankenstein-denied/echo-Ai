# Echo Android — native features plan

Status 2026-11-05: **Phase 1 done** (Capacitor shell on `main` @ 64d5822, loads https://echo-ai-blue.vercel.app, native Google sign-in). Everything below is still to do.

Goal (prof's request): use Echo without opening the app — a pinned Echo notification with Reminders/Goals, type-to-chat, mic, and on-time reminder alarms. Android only (iOS cannot do this).

## Environment facts (don't re-discover)
- Build JDK: `~/.jdks/jdk-21.0.13+9` (Android Studio's bundled JBR 25 breaks Gradle 8.14). Set in `~/.gradle/gradle.properties`; Android Studio Gradle JDK must also be jdk-21.
- CLI build: `cd android && ./gradlew.bat assembleDebug` (with `JAVA_HOME` = the JDK above). APK: `android/app/build/outputs/apk/debug/app-debug.apk`.
- Install: `adb -s 138462554Y004657 install -r <apk>` (TECNO CM5, Android 15, HiOS). adb = `%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe`.
- After changing `capacitor.config.ts` or adding a plugin: `npx cap sync android`.
- Web changes reach the phone on Vercel deploy; only native (Kotlin/manifest) changes need a new APK.
- Firestore: `users/{uid}/reminders` `{title, dueAt: Timestamp, done, source, createdAt, updatedAt}`; `users/{uid}/goals` `{title, category, progress 0-100, streak, milestones, targetDate?}`. API auth: `Authorization: Bearer <Firebase ID token>` (`lib/server/verify-user.ts`).

## Key design decision: how native code knows the user
`skipNativeAuth: true` means the native Firebase SDK is **not** signed in (and email users never are). So:
- New tiny Capacitor plugin **`EchoBridge`** (Kotlin, in `android/app`). After login the web calls `EchoBridge.setSession({ uid, refreshToken, apiKey })`; on sign-out `EchoBridge.clearSession()`.
- Native stores it in **EncryptedSharedPreferences**, gets fresh ID tokens from `securetoken.googleapis.com/v1/token`, and talks to **Firestore REST** + **`/api/echo`**. Firestore rules still protect data — no rule changes needed.
- Web side: one hook in `lib/auth-context.tsx`, guarded by `Capacitor.isNativePlatform()` — website unaffected.

## Phase 2 — Pinned notification (Reminders / Goals)
1. `EchoBridge` plugin + session storage (above).
2. `EchoNotificationService` — foreground service (`specialUse`), ongoing notification, custom `RemoteViews` layout:
   - Header "Echo", two tab buttons **Reminders | Goals** (swap content, store selected tab in prefs).
   - Reminders: next 3 not-done, sorted by `dueAt`, each with **✓ Done** and **💤 +15m** (PendingIntent → `ActionReceiver` → Firestore REST PATCH).
   - Goals: top 3 by `updatedAt` with progress %; tap opens app at `/goals`.
   - Footer buttons: **🎤 Talk** and **✏️ Type** (wired in phases 3–4; tap opens app for now).
3. Refresh: on service start, after every action, when app signals data changed, and every 15 min via WorkManager.
4. Permissions/robustness: `POST_NOTIFICATIONS` prompt (Android 13+), `BOOT_COMPLETED` receiver to restart, a one-time "Disable battery optimization" prompt (**HiOS kills background apps aggressively**).
5. Settings toggle in the web app ("Pinned Echo notification", native only) → `EchoBridge.setPinned(bool)`.
- Done when: notification survives app swipe-away and reboot; Done/Snooze changes show on the website.

## Phase 3 — Type to Echo from the notification
- `RemoteInput` inline reply on the **Type** action → `ReplyReceiver` → POST `/api/echo` with ID token → show Echo's answer as a `MessagingStyle` notification (conversation look), allow replying again.
- Confirm `/api/echo` request/response shape first (read `app/api/echo/route.ts`); reminders/goals created by chat must refresh the pinned notification.

## Phase 4 — Mic popup
- Translucent `VoiceActivity` (dialog over current app) launched from **Talk**: `RECORD_AUDIO` permission, Android `SpeechRecognizer` → text → same `/api/echo` path → answer shown in the popup (+ optional TTS via `/api/voice/speak` or Android TTS).
- Fallback if device has no Google speech service: record audio → `/api/voice/transcribe`.

## Phase 5 — On-time reminder alarms
- On every refresh, schedule `AlarmManager.setExactAndAllowWhileIdle` for each upcoming reminder (needs `SCHEDULE_EXACT_ALARM` / `USE_EXACT_ALARM`), cancel removed ones.
- Alarm → high-priority heads-up notification with Done / Snooze. Works offline; no server cron needed.

## Polish (any time, small)
- Echo app icon + splash (currently Capacitor defaults) — `@capacitor/assets` from `public/icons`.
- Status bar / navigation bar colors to match the dark theme.
- Android back button navigates web history instead of closing the app (`@capacitor/app` backButton listener).
- Release signing: create keystore (back it up, never commit), add release SHA-1 to Firebase, build `app-release.apk` for prof/panel.
- Optional later: home-screen widget (reuses Phase 2 RemoteViews), chathead overlay (`SYSTEM_ALERT_WINDOW`).

## Session plan (token-saving)
One phase per session, `/clear` between. User does clicking (Firebase console, phone permissions, installs); share only red error lines from builds. Final code review once at the end, not per phase.
