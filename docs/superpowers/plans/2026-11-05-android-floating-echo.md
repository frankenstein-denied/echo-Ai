# Floating Echo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the notification's 🎤 Talk start a glowing voice call over any app, make ✏️ Type show a draggable Echo chathead with a floating diary, and replace the default Android icon with Echo's.

**Architecture:** A transparent trampoline Activity receives notification taps and decides what to do. `FloatingCallService` hosts a WebView running the site's existing call logic plus native glow, exit and status overlays. `ChatheadService` hosts the bubble and a second WebView showing the diary. The site gains an opt-in `?embed=` mode and talks to native through a `window.EchoFloat` JavaScript interface.

**Tech Stack:** Java (Android, target SDK 36, min SDK 24), Capacitor 8 shell, Next.js + React + TypeScript, vitest, JUnit.

**Spec:** `docs/superpowers/specs/2026-11-05-android-floating-echo-design.md`

## Global Constraints

- New native code is Java under `com.echo.app.floating`. Build needs `JAVA_HOME=$HOME/.jdks/jdk-21.0.13+9`.
- Glow colour `#39FF88`. Pill text exactly: "Connecting…", "Listening", "Thinking", "Echo is speaking".
- Failure message stays about 3 seconds, then all call overlays disappear.
- Icon colours: background `#0B0F14`, circle `#2DD4BF`, star `#04201C`. Source: `public/icons/echo.svg`.
- Button copy: "Open in app ↗".
- Embedded mode is opt-in through the URL only. Normal web users and phones on 1.2 must see no change.
- `window.EchoFloat` may be used only by the Echo site origin. WebViews must not navigate the main frame to another origin.
- Never merge, push or publish without the owner's explicit approval. The owner is a first-time Android developer: phone steps are click-by-click.

## Review Focus

1. Talk tapped twice quickly: exactly one call starts. Tested in `FloatLaunchDecisionTest` (Task 4) and by the service's single-start guard (Task 5).
2. Exit tapped while "Connecting…": the call stops, microphone and wake lock are released, and no audio plays afterwards. Tested in `CallSessionStateTest` (Task 5).
3. Page never reports a phase (network down, site error): a 20-second connect timeout shows a failure and removes the overlays. Tested in `CallSessionStateTest` (Task 5).
4. Permission revoked mid-session, or service killed by the phone: no stray glow is left, and the next tap starts cleanly. Tested in `CallSessionStateTest` (restart state) and by hand (Task 7).
5. Keyboard open in the floating diary: the composer stays visible and typing works. Pinned by `chathead window flags` in `ChatheadGeometryTest` (Task 6) and by hand (Task 7).

---

### Task 1: Spike a service-hosted voice call (throwaway)

Proves the riskiest assumption before anything is built. Needs no web deploy: it loads the live site and clicks the existing call button with injected JavaScript.

**Files:**
- Work on throwaway branch `spike/floating-call` from `feat/floating-echo`. It is never merged.
- Create: `android/app/src/main/java/com/echo/app/floating/SpikeCallService.java`
- Modify: `android/app/src/main/AndroidManifest.xml`, `MainActivity.java` (temporary start hook)

**Interfaces:**
- Produces: a written result in the ledger, covering which of the four checks passed and any settings that were needed. Later tasks copy those settings.

- [ ] **Step 1: Build the spike.** A `microphone` foreground service, started from a visible Activity, adds a 1×1 `TYPE_APPLICATION_OVERLAY` WebView loading `https://echo-ai-blue.vercel.app/?view=Diary`. Set `setMediaPlaybackRequiresUserGesture(false)`, JavaScript and DOM storage on, and grant `RESOURCE_AUDIO_CAPTURE` in `onPermissionRequest`. After load, poll with `evaluateJavascript` for `[aria-label="Call Echo"]` and click it. Log the page's console and connection state to logcat with tag `EchoSpike`. Hold a partial wake lock.
- [ ] **Step 2: Install on the phone.** `adb -s 138462554Y004657 install -r android/app/build/outputs/apk/debug/app-debug.apk`. Expected: `Success`. If the phone is not connected, stop and ask the owner to connect it.
- [ ] **Step 3: Owner test.** Pass requires all four: Echo is heard; Echo responds to speech; the call survives switching to another app; the call survives 2 minutes with the screen off. Also record whether the page was signed in without the main Activity having started in that process.
- [ ] **Step 4: Record the result, then return to `feat/floating-echo`.** If any check fails and cannot be fixed, stop and tell the owner, as the spec requires. Do not continue to Task 3.

### Task 2: Echo's icon and splash

**Files:**
- Create: `android/app/src/main/res/drawable/ic_launcher_foreground.xml`, `android/app/src/main/res/drawable/ic_echo_head.xml`
- Modify: `res/mipmap-anydpi-v26/ic_launcher.xml`, `ic_launcher_round.xml`, `res/values/ic_launcher_background.xml`, every `res/mipmap-*dpi/ic_launcher*.png`, every `res/drawable*/splash.png`
- Delete: `res/mipmap-*dpi/ic_launcher_foreground.png`

**Interfaces:**
- Produces: `@drawable/ic_echo_head`, a teal circle with a dark star filling its bounds. Task 6 uses it for the chathead.

- [ ] **Step 1: Write the vector foreground.** Teal circle and star from `public/icons/echo.svg`, scaled so the circle sits inside the adaptive safe zone (66 of 108 units). Set `ic_launcher_background` to `#0B0F14` and point both adaptive icons at `@drawable/ic_launcher_foreground`.
- [ ] **Step 2: Render the legacy PNGs and splash.** Render `public/icons/icon-512.png` to each density (48, 72, 96, 144, 192 px), and a round version for `ic_launcher_round.png`. Replace each `splash.png` at its existing pixel size with `#0B0F14` and the centred Echo mark.
- [ ] **Step 3: Verify.** Run `./gradlew.bat :app:assembleDebug` from `android/`. Expected: `BUILD SUCCESSFUL`. Open three of the generated PNGs and confirm the Echo mark shows and no default Android or Capacitor art remains.
- [ ] **Step 4: Commit** with message `feat(android): use Echo's icon and splash`.

### Task 3: Web embedded mode

**Files:**
- Create: `lib/echo/embed.ts`, `lib/echo/embed.test.ts`, `lib/native/float-bridge.ts`, `lib/native/float-bridge.test.ts`
- Modify: `components/echo/shell.tsx`, `components/echo/diary-view.tsx`, `components/echo/home.tsx`, `lib/native/echo-bridge.ts`, `lib/native/echo-bridge.test.ts`

**Interfaces:**
- Produces, consumed by Tasks 4 to 6:
  - URLs: `/?embed=chat` and `/?embed=call`.
  - Native object `window.EchoFloat` with methods `onCallPhase(phase: string)`, `onCallEnded(reason: string)`, `onSignedOut()`, `openInApp()`, `refreshNotification()`.
  - Web hook `window.__echoFloatEnd()`, which native calls to end the call.
  - `phase` values are `CallPhase` from `components/echo/call-panel.tsx`. `reason` is `user`, `failed`, `quota` or `dropped`.
  - `EchoBridge` plugin additions: `isFloatingCallActive(): Promise<{ active: boolean }>` and `setAppCallActive({ active: boolean }): Promise<void>`.
- `lib/echo/embed.ts`: `parseEmbedMode(search: string): 'chat' | 'call' | null`.
- `lib/native/float-bridge.ts`: `hasFloatBridge(): boolean`, `reportCallPhase(phase: string): void`, `reportCallEnded(reason: string): void`, `reportSignedOut(): void`, `openFullApp(): void`, `requestFloatRefresh(): void`, each a no-op without `window.EchoFloat`. Also `isFloatingCallActive(): Promise<boolean>` and `setAppCallActive(active: boolean): Promise<void>`, which swallow errors from a 1.2 APK that lacks the methods and then return false or resolve.

- [ ] **Step 1: Write failing tests.**

```ts
expect(parseEmbedMode('?embed=chat')).toBe('chat')
expect(parseEmbedMode('?embed=call&x=1')).toBe('call')
expect(parseEmbedMode('?embed=evil')).toBeNull()
expect(parseEmbedMode('')).toBeNull()
// float-bridge: no window.EchoFloat -> reportCallPhase('listening') does not throw
// with a stub -> reportCallEnded('user') calls stub.onCallEnded('user')
// isFloatingCallActive() resolves false when the plugin method rejects
// echo-bridge: queueNativeNotificationRefresh() calls EchoFloat.refreshNotification once after a burst when the stub exists, even off native
```

- [ ] **Step 2: Run** `npx vitest run lib/echo/embed lib/native`. Expected: FAIL.
- [ ] **Step 3: Implement the modules.** Read `parseEmbedMode` once when `Dashboard` first renders and keep it in state, because the shell clears the URL. In `echo-bridge.ts`, `queueNativeNotificationRefresh` also works when `hasFloatBridge()` is true.
- [ ] **Step 4: Wire the UI.** `Dashboard` with an embed mode renders only `DiaryView`, with no `Sidebar`, `MobileTabBar`, `MoreSheet` or title bar. `DiaryView` takes `embed?: 'chat' | 'call'` and opens today's page directly, skipping the mobile page list. `Home` takes `embed?: 'chat' | 'call'`. For `call`, it starts the call once when context is ready, reports each `call.phase`, reports the end with its reason, sets `window.__echoFloatEnd = call.end`, and renders nothing visible. If a call would start while a floating call runs in the full app, `startCall` shows a short message instead. `Home` calls `setAppCallActive` when `call.active` changes. With no signed-in user in embed mode, call `reportSignedOut()` rather than showing a login page.
- [ ] **Step 5: Confirm diary sync.** Read how `Home` loads messages. If it does not use a live listener, reload messages when the embedded page becomes visible. Record which applies in the report.
- [ ] **Step 6: Verify.** `npx vitest run`, `npx tsc --noEmit`, and `npx next build`. Expected: all pass. With `next dev`, confirm `/?view=Diary` is unchanged and `/?embed=chat` shows only the diary.
- [ ] **Step 7: Commit** with message `feat(web): add embedded diary and call modes for floating Echo`.

### Task 4: Launch flow and shared WebView

**Files:**
- Create in `com/echo/app/floating/`: `FloatLaunchDecision.java`, `FloatLaunchActivity.java`, `EmbedOrigin.java`, `EmbedWebView.java`, `EchoFloatInterface.java`, `FloatState.java`
- Create tests: `android/app/src/test/java/com/echo/app/floating/FloatLaunchDecisionTest.java`, `EmbedOriginTest.java`
- Modify: `AndroidManifest.xml`, `res/values/styles.xml`, `res/values/strings.xml`, `echo/NotificationRenderer.java`, `echo/EchoBridgePlugin.java`

**Interfaces:**
- Consumes: Task 3's URLs, `window.EchoFloat` methods and plugin methods.
- Produces:
  - `FloatLaunchDecision.Outcome decide(String action, boolean signedIn, boolean overlayGranted, boolean micGranted, boolean callRunning, boolean appCallActive)`, with `Outcome` values `OPEN_APP`, `OPEN_OVERLAY_SETTINGS`, `REQUEST_MIC`, `START_CALL`, `SHOW_CHATHEAD`, `ALREADY_RUNNING`, `BLOCKED_BY_APP_CALL`.
  - `FloatLaunchActivity.ACTION_TALK = "talk"` and `ACTION_TYPE = "type"`.
  - `FloatState`: volatile static `callRunning`, `appCallActive`.
  - `EmbedOrigin.isAllowed(String url): boolean`, true only for `https` on the `DeepLinks.LIVE_SITE` host.
  - `EmbedWebView.create(Context, String path, EchoFloatInterface.Listener): WebView`, using the settings Task 1 proved, an origin-locked `WebViewClient`, and `window.EchoFloat`.
  - `EchoFloatInterface.Listener`: `onCallPhase(String)`, `onCallEnded(String)`, `onSignedOut()`, `onOpenInApp()`, `onRefreshNotification()`, delivered on the main thread.

- [ ] **Step 1: Write failing tests.**

```java
assertEquals(OPEN_APP, decide("talk", false, true, true, false, false));
assertEquals(OPEN_OVERLAY_SETTINGS, decide("type", true, false, true, false, false));
assertEquals(REQUEST_MIC, decide("talk", true, true, false, false, false));
assertEquals(SHOW_CHATHEAD, decide("type", true, true, false, false, false)); // Type needs no mic
assertEquals(START_CALL, decide("talk", true, true, true, false, false));
assertEquals(ALREADY_RUNNING, decide("talk", true, true, true, true, false));
assertEquals(BLOCKED_BY_APP_CALL, decide("talk", true, true, true, false, true));
assertTrue(EmbedOrigin.isAllowed("https://echo-ai-blue.vercel.app/?embed=chat"));
assertFalse(EmbedOrigin.isAllowed("http://echo-ai-blue.vercel.app/"));
assertFalse(EmbedOrigin.isAllowed("https://echo-ai-blue.vercel.app.evil.example/"));
assertFalse(EmbedOrigin.isAllowed("https://evil.example/?u=echo-ai-blue.vercel.app"));
assertFalse(EmbedOrigin.isAllowed(null));
```

- [ ] **Step 2: Run** `./gradlew.bat :app:testDebugUnitTest`. Expected: FAIL to compile.
- [ ] **Step 3: Implement the pure classes**, then re-run. Expected: PASS.
- [ ] **Step 4: Implement the trampoline.** A transparent, `noHistory`, `excludeFromRecents` Activity with a translucent no-animation theme. It runs the decision, acts on it, and finishes. `OPEN_OVERLAY_SETTINGS` opens `Settings.ACTION_MANAGE_OVERLAY_PERMISSION` for this package with the toast "Allow Echo to display over other apps, then tap again." `BLOCKED_BY_APP_CALL` shows the toast "You're already on a call in Echo." `OPEN_APP` opens `MainActivity`.
- [ ] **Step 5: Wire the notification.** Point `btn_talk` and `btn_type` at the trampoline with new unique request codes. Add `SYSTEM_ALERT_WINDOW`, `FOREGROUND_SERVICE_MICROPHONE` and `WAKE_LOCK` to the manifest. Add `isFloatingCallActive` and `setAppCallActive` to `EchoBridgePlugin`. `START_CALL` and `SHOW_CHATHEAD` call the service entry points from Tasks 5 and 6 once they exist, and log until then.
- [ ] **Step 6: Verify** with `./gradlew.bat :app:testDebugUnitTest :app:assembleDebug`. Expected: `BUILD SUCCESSFUL`.
- [ ] **Step 7: Commit** with message `feat(android): route notification Talk and Type through a launch decision`.

### Task 5: Floating call

**Files:**
- Create in `com/echo/app/floating/`: `FloatingCallService.java`, `CallSessionState.java`, `CallPhaseLabel.java`, `GlowView.java`
- Create tests: `android/app/src/test/java/com/echo/app/floating/CallSessionStateTest.java`, `CallPhaseLabelTest.java`
- Create: `res/layout/float_call_controls.xml`
- Modify: `AndroidManifest.xml`, `res/values/strings.xml`, `floating/FloatLaunchActivity.java`

**Interfaces:**
- Consumes: `EmbedWebView.create(...)` with path `/?embed=call`, `FloatState`, `Outcome.START_CALL`.
- Produces: `FloatingCallService.start(Context)`.
- `CallSessionState`: pure state machine with `start(long nowMs): boolean`, `onPhase(String, long)`, `onEnded(String reason, long)`, `requestExit(long)`, `tick(long nowMs)`, `pillText(): String`, `shouldTearDown(): boolean`, `isRunning(): boolean`. `CONNECT_TIMEOUT_MS = 20000`, `FAILURE_SHOW_MS = 3000`.
- `CallPhaseLabel.of(String phase): String` for the Global Constraints copy. `idle` and unknown phases return "".

- [ ] **Step 1: Write failing tests.**

```java
CallSessionState s = new CallSessionState();
assertTrue(s.start(0));
assertFalse(s.start(10));                       // no second call
s.tick(19999); assertFalse(s.shouldTearDown());
s.tick(20000); assertEquals("Couldn't connect", s.pillText());
s.tick(22999); assertFalse(s.shouldTearDown());
s.tick(23000); assertTrue(s.shouldTearDown());  // failure shows 3 s

CallSessionState e = new CallSessionState();
e.start(0); e.requestExit(5); assertTrue(e.shouldTearDown());   // exit while connecting
e.onPhase("speaking", 6); assertTrue(e.shouldTearDown());       // late phase cannot revive it

CallSessionState q = new CallSessionState();
q.start(0); q.onPhase("listening", 1); q.onEnded("quota", 2);
assertEquals("Echo's voice reached today's limit", q.pillText());
q.tick(5002); assertTrue(q.shouldTearDown());

CallSessionState r = new CallSessionState();
assertFalse(r.isRunning()); assertTrue(r.start(0)); // fresh state after a kill starts cleanly

assertEquals("Echo is speaking", CallPhaseLabel.of("speaking"));
assertEquals("Connecting…", CallPhaseLabel.of("connecting"));
assertEquals("", CallPhaseLabel.of("idle"));
```

Other failure text: `dropped` gives "The call dropped", and `failed` gives "Couldn't connect". `user` tears down immediately.

- [ ] **Step 2: Run** the tests. Expected: FAIL. Implement the pure classes, then re-run. Expected: PASS.
- [ ] **Step 3: Implement the service.** Foreground type `microphone`, with its own ongoing "On a call with Echo" notification. Windows: the call WebView at 1×1 as Task 1 proved; a full-screen `GlowView` that is `FLAG_NOT_TOUCHABLE | FLAG_NOT_FOCUSABLE` with window alpha `0.8`, pulsing `#39FF88` around the edge; and a separate small touchable window at bottom centre with the pill and the round red exit button. Exit evaluates `window.__echoFloatEnd?.()`, then tears down. Teardown removes all windows, destroys the WebView, releases the wake lock, clears `FloatState.callRunning`, refreshes the pinned notification and stops the service. Run `tick` on a 1-second main-thread handler. `onSignedOut` opens the app and tears down.
- [ ] **Step 4: Connect `Outcome.START_CALL`** to `FloatingCallService.start`.
- [ ] **Step 5: Verify** with `./gradlew.bat :app:testDebugUnitTest :app:assembleDebug`. Expected: `BUILD SUCCESSFUL`.
- [ ] **Step 6: Commit** with message `feat(android): floating voice call with glow and exit button`.

### Task 6: Chathead

**Files:**
- Create in `com/echo/app/floating/`: `ChatheadService.java`, `ChatheadGeometry.java`
- Create test: `android/app/src/test/java/com/echo/app/floating/ChatheadGeometryTest.java`
- Create: `res/layout/float_panel.xml`, `res/layout/float_remove_target.xml`
- Modify: `AndroidManifest.xml`, `res/values/strings.xml`, `floating/FloatLaunchActivity.java`

**Interfaces:**
- Consumes: `EmbedWebView.create(...)` with path `/?embed=chat`, `@drawable/ic_echo_head`, `Outcome.SHOW_CHATHEAD`.
- Produces: `ChatheadService.show(Context)`, which does nothing new when already showing.
- `ChatheadGeometry`: `snapX(int x, int headSize, int screenW): int`, `isTap(float dx, float dy, long ms, float slop): boolean`, `overRemoveTarget(int cx, int cy, int targetCx, int targetCy, int radius): boolean`, `clampY(int y, int headSize, int screenH): int`, and `panelFlags(): int`, the window flags for the open diary window.

- [ ] **Step 1: Write failing tests.**

```java
assertEquals(0, ChatheadGeometry.snapX(100, 50, 1000));
assertEquals(950, ChatheadGeometry.snapX(800, 50, 1000));
assertTrue(ChatheadGeometry.isTap(2, 2, 100, 10));
assertFalse(ChatheadGeometry.isTap(40, 0, 100, 10));   // moved: a drag
assertFalse(ChatheadGeometry.isTap(2, 2, 900, 10));    // held: not a tap
assertTrue(ChatheadGeometry.overRemoveTarget(500, 1800, 500, 1810, 80));
assertFalse(ChatheadGeometry.overRemoveTarget(100, 900, 500, 1810, 80));
assertEquals(0, ChatheadGeometry.clampY(-40, 50, 2000));
assertEquals(1950, ChatheadGeometry.clampY(2500, 50, 2000));
// chathead window flags: focusable so the keyboard works
assertEquals(0, ChatheadGeometry.panelFlags() & WindowFlags.NOT_FOCUSABLE);
```

Define the flag values as constants in `ChatheadGeometry` so the test needs no Android classes.

- [ ] **Step 2: Run, implement, re-run.** Expected: FAIL, then PASS.
- [ ] **Step 3: Implement the service.** Foreground type `specialUse` with a subtype property. The bubble is a `FLAG_NOT_FOCUSABLE` overlay using `ic_echo_head`, draggable, snapping to the nearest side edge on release. During a drag, show the ✕ target at bottom centre, and remove the chathead and stop the service if dropped on it. A tap opens the panel: a dim layer plus a focusable window with `SOFT_INPUT_ADJUST_RESIZE`, small margins, a header with "Diary" and "Open in app ↗", and the WebView created on first open and kept while the chathead lives. Tapping the bubble, tapping outside, or pressing Back shrinks it. "Open in app ↗" opens `MainActivity` with `DeepLinks.DIARY` and shrinks. `onSignedOut` opens the app and shrinks.
- [ ] **Step 4: Connect `Outcome.SHOW_CHATHEAD`** to `ChatheadService.show`.
- [ ] **Step 5: Verify** with `./gradlew.bat :app:testDebugUnitTest :app:assembleDebug`. Expected: `BUILD SUCCESSFUL`.
- [ ] **Step 6: Commit** with message `feat(android): draggable chathead with floating diary`.

### Task 7: Version and phone test

Web changes must be live for this test, so it needs the owner's approval to push or deploy.

**Files:**
- Modify: `android/app/build.gradle` (`versionCode 4`, `versionName "1.3"`)
- Create: `docs/superpowers/plans/2026-11-05-android-floating-echo-phone-test.md`

- [ ] **Step 1: Bump the version and write the checklist.** One click-by-click item per Success criterion in the spec, plus: keyboard works in the diary window; Talk and chathead together; opening the full app during a floating call; force-stopping Echo leaves no stray glow, and the next tap works.
- [ ] **Step 2: Ask the owner** to approve making the web changes reachable from the phone, then install with `adb -s 138462554Y004657 install -r`.
- [ ] **Step 3: Run the checklist with the owner.** Fix what fails through the normal review loop. Commit with message `chore(android): bump to 1.3 and add phone test checklist`.
