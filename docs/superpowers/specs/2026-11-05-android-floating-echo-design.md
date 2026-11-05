# Floating Echo on Android: voice glow, chathead, and app icon

Date: 2026-11-05. Status: awaiting approval. Branch: `feat/floating-echo`.

## Why

The owner's professor wants Echo usable without opening the app. The pinned notification (shipped) has
🎤 Talk and ✏️ Type buttons, but both only open the full app today. This work makes each one work on top of
whatever app the user is already in. The Android app also still shows the default Android Studio icon, which
makes it look unfinished.

## Goals

1. 🎤 Talk on the notification starts a voice call with Echo immediately, without opening the Echo app.
2. ✏️ Type on the notification shows a floating Echo chathead, without opening the Echo app.
3. Echo's own icon is used on the phone's home screen and on the chathead.

## Non-goals

- iOS, wake word, home-screen widget, reminder alarms (other roadmap phases).
- Changing how the in-app call or in-app diary works for people using the full app or the website.
- Native rewrite of the Echo chat or voice logic, unless the spike in "Risk first" forces it.

## Anti-goals (a failure even if it technically works)

- Tapping Talk flashes or lands in the full Echo app.
- The glow stops the user from using the app behind it.
- The call dies when the user switches apps or the screen turns off.
- Things said in a floating call or typed in the chathead do not save to notes, goals, reminders or the diary.

## What the user sees

### 🎤 Talk (owner chose mockup A: glow over the current app)

- Tapping Talk connects a call right away. There is no extra screen and no second tap.
- The app the user was in stays visible. A neon green glow runs around the whole screen edge and pulses gently.
  Colour: `#39FF88`.
- A round red exit button sits at the bottom centre. Tapping it ends the call and removes the glow and button.
- A small dark pill above the exit button shows the state: "Connecting…", "Listening", "Thinking",
  "Echo is speaking", or an error.
- The user can keep scrolling and tapping the app behind the glow. Only the exit button and pill belong to Echo.
- The call works like the in-app call: same voice setting, same memory and context, and saves land in the same
  places. It writes to today's diary page, as the in-app call does.
- The call continues through app switches and screen-off until exit is tapped or the call fails.
- If the call fails (no network, voice quota reached, session limit), the pill shows the reason for about 3 seconds,
  then glow, button and pill all disappear.
- Tapping Talk while a floating call is running does nothing new (no second call).

### ✏️ Type (owner approved the three-step mockup)

- Tapping Type shows the chathead. It does not open the diary by itself.
- The chathead is a round Echo icon floating above all apps. It can be dragged anywhere. On release it snaps to the
  nearest left or right edge.
- Tapping it opens a floating window over the current app, with the background dimmed. The window shows the diary
  directly, on today's page, and the user can type to Echo and read replies. The keyboard must work in the window.
- The window has an "Open in app ↗" button at the top right. It opens the full Echo app on the diary and shrinks the
  chathead back.
- Tapping the chathead again, tapping outside the window, or pressing Back shrinks it back to the chathead.
- While dragging, an ✕ target appears at the bottom centre. Dropping the chathead on it removes the chathead, like
  Messenger. It stays gone until Type is tapped again.
- Tapping Type while the chathead is already showing leaves it where it is.
- The chathead survives app switches. It does not need to come back after a reboot.

### Talk and Type together

- Starting Talk while the chathead is showing keeps the chathead. Glow and chathead can both be on screen.
- Only one voice call can run at once. If the full app already has a call running, the floating call must not start
  a second one (builder decides how to detect or prevent this).
- Opening the full app, including through "Open in app", does not end a floating call. The glow and exit button stay, and
  the in-app call button is blocked with a short message until the floating call ends. (Author's call.)
- The chathead window and the full app can both show the diary. Both read Firestore, so the plan must confirm the diary
  updates live on both, and add a reload on open if it does not.

### Permissions

- "Display over other apps" is required for both features. If it is missing when Talk or Type is tapped, Echo opens
  that Android settings page with a short explanation. After the user grants it, they tap the button again; automatic
  retry is not required.
- Microphone is already requested on first launch. If it is missing when Talk is tapped, ask for it, then continue.
- If the user is signed out, Talk and Type open the full app on the sign-in screen, matching current behaviour.
- A Settings screen status line for "Display over other apps" is optional.

### Icon

- Echo's mark is the source: `public/icons/echo.svg` (dark `#0B0F14` rounded square, teal `#2DD4BF` circle, dark star
  `#04201C`), with `public/icons/icon-maskable-512.png` as the safe-zone reference.
- Replace all `mipmap-*` launcher icons, the adaptive foreground, and `ic_launcher_background` (currently white).
  Round and adaptive variants must look right.
- The chathead uses the teal circle with the dark star.
- Replace the default Capacitor splash (`drawable*/splash.png`) too, if it shows the Capacitor or default mark.

## How it gets built

### Decided

- Stay on the existing stack: Capacitor shell, Java in `com.echo.app`, website loaded from the live site. New native
  code follows the existing Java package style, even though older notes say Kotlin.
- Reuse the website's existing diary and call logic inside a WebView hosted by a native service, rather than rewriting
  them natively. That logic (`useEchoCall` in `components/echo/call-panel.tsx`, plus `Home`) holds context building,
  tools, saving and memory, and rewriting it would create a second copy to maintain.
- Native overlays use `TYPE_APPLICATION_OVERLAY` and the `SYSTEM_ALERT_WINDOW` permission.

### Known technical constraints the builder must handle

- **Notification buttons.** `btn_talk` and `btn_type` in `NotificationRenderer` currently call `openApp`. They must start
  the new flow instead. A tap should go through a transparent, no-history trampoline Activity. Being a visible Activity
  puts Echo in the foreground at the moment the microphone foreground service starts, which Android 14+ requires for
  while-in-use microphone access. The trampoline must not visibly flash the app.
- **Foreground service.** The call needs `foregroundServiceType="microphone"` with `FOREGROUND_SERVICE_MICROPHONE`. The
  chathead can use `specialUse` with a subtype property, like `EchoNotificationService`. Target SDK is 36, min SDK 24.
- **Touch pass-through.** On Android 12+, a full-screen overlay from another app can block touches underneath even with
  `FLAG_NOT_TOUCHABLE`, unless its opacity is at most 0.8. The glow must allow touches through, for example with a window
  alpha of 0.8 or thin edge strips. The exit button is a separate touchable window.
- **Autoplay.** `useEchoCall.start` assumes a user click creates its `AudioContext`. The hosting WebView needs
  `setMediaPlaybackRequiresUserGesture(false)` and must grant `RESOURCE_AUDIO_CAPTURE` in `onPermissionRequest`.
- **Staying alive.** A WebView not attached to a visible window can be throttled or paused. The call WebView must stay
  attached (a tiny overlay window is acceptable) and running with the screen off. A partial wake lock is acceptable
  during a call only and must be released when it ends.
- **Sign-in in the new WebView.** Firebase auth persists in the app's WebView storage, which a same-process WebView should
  share with the main one. Verify this, including when the main Activity has never started since boot. If the page shows
  signed out, the flow must fail cleanly rather than show a login page in the glow or chathead.
- **No Capacitor in the plain WebView.** `Capacitor.isNativePlatform()` will be false there, so `lib/native/echo-bridge.ts`
  no-ops and the notification will not refresh after saves. Provide a small native interface for this page: call state,
  end call, open in app, refresh notification. Expose it only to the Echo site origin, and do not let the WebView navigate
  to any other origin.
- **Web side.** Add a compact embedded mode to the site, for example a URL parameter or route. The chathead window shows
  only the diary, with no sidebar, tab bar or other navigation. The call mode auto-starts the call and reports its phase
  and end to native, with no visible UI. Existing web users must see no change.
- **Web and native rollout.** Web changes reach phones through Vercel immediately, while native changes need a release.
  Embedded mode is strictly opt-in through the URL, so a phone on 1.2 and the normal website never enter it.
- **Voice auth.** `/api/voice/session` takes a Firebase ID token as a Bearer header (`lib/echo/voice-client.ts`,
  `verifyUser`), not a cookie or anything from Capacitor, so the plain WebView only needs a signed-in Firebase user.
- **Separate WebViews.** Talk and Type use separate WebView instances, because they can run at once and must not share a
  `useEchoCall`. (Author's call.)
- **Notification refresh.** Saves from both the floating call and the chathead diary refresh the notification.
- **Android versions.** The TECNO CM5 on Android 15 is the only hard test target. Older versions from min SDK 24 are
  best effort: they must not crash, and version-specific code only branches where Android requires it. (Author's call.)
- **Battery optimisation.** The owner's TECNO CM5 (Android 15, HiOS) is known for killing background apps, so the existing
  battery-settings prompt matters here.

### Risk first

Before building the polished experience, do a throwaway spike on the owner's phone that proves: a service-hosted WebView
connects a Gemini Live call, can capture the microphone, plays audio, and keeps running when switching apps and with the
screen off for at least 2 minutes.

If the spike fails and cannot be fixed, stop and tell the owner. The fallback is a native audio call (Kotlin or Java
WebSocket to Gemini Live, using the token from `/api/voice/session`). That means moving tool handling and saving behind a
server endpoint, which is a much larger job and needs a fresh decision.

### Left to the builder

- Exact file and class names, and whether one service or two own the overlays.
- Glow rendering (drawable, shader or edge strips) as long as it looks like the mockup and passes touches through.
- Exact chathead animations, and the floating window's size (the mockup shows most of the screen, with small margins).
- Exact web approach for embedded mode.

## Testing and success

- Unit tests for pure logic, matching existing style (`android/app/src/test`, vitest for web).
- Hand test on the TECNO CM5, with a click-by-click checklist for the owner, who is a first-time Android developer.
- Success means all of these work on that phone, starting from another app with Echo not open:
  1. Talk connects with no app flash, and Echo can be heard and can hear the user.
  2. The app behind the glow can be scrolled and tapped during the call.
  3. Exit ends the call and removes everything.
  4. The call survives switching apps and 2 minutes with the screen off.
  5. Something saved by voice appears in the app and notification.
  6. Type shows the chathead, which drags, snaps, opens the diary, sends a message, and is removed by dragging to ✕.
  7. Open in app lands on the diary.
  8. The home screen shows the Echo icon.

## Shipping

Release as a new Android version through `scripts/release-android.sh`, only when the owner asks. A release pushes to phones
and is public, and merging to `main` deploys the website.
