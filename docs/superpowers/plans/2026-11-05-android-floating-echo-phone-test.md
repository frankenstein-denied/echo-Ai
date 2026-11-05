# Floating Echo phone test checklist (version 1.3)

Phone: TECNO CM5, Android 15. Spec: `docs/superpowers/specs/2026-11-05-android-floating-echo-design.md`.

Work from top to bottom, because later items rely on earlier ones. Tick the box when an item passes. If an item fails,
write down what the "If it fails" line asks for, then carry on with the next item unless it says to stop. The last section
explains how to report a bug.

Items marked "Spec success 1" to "Spec success 8" are the eight things the spec needs for this feature to count as done.

## Before you start

These two jobs happen on the PC, before the phone test.

- [ ] **The website changes are live.** Talk and Type load the live site (`https://echo-ai-blue.vercel.app`) with the new
  embedded pages. This branch is not on `main` yet, so they are not live until you approve that. Without them, every Talk
  ends in "Couldn't connect" after about 20 seconds, and the Type window shows the full app with its tabs. If you see
  either of those, stop and report it, because the rest of the list cannot pass.
- [ ] **Version 1.3 is on the phone.** Connect the phone by USB. In Git Bash on the PC, run:

  ```
  cd ~/desktop/echo-ai/android
  JAVA_HOME="$HOME/.jdks/jdk-21.0.13+9" ./gradlew.bat assembleDebug
  adb -s 138462554Y004657 install -r app/build/outputs/apk/debug/app-debug.apk
  ```

  You should see `Success` at the end.

Then on the phone:

- [ ] Long-press the Echo icon, tap **App info**, and check that the version says **1.3**.
- [ ] Open Echo and make sure you are signed in.
- [ ] In Echo, tap **More**, then **Settings**. Check that the Echo notification is on. If a yellow box says
  "TECNO/HiOS may close Echo in the background", tap **Turn off battery optimization** and follow it. Also allow
  Auto-start for Echo in Phone Master, as the box says.
- [ ] Turn the volume up, so you can hear Echo.

### Two moves you will use all the time

**Start position** (this is the "Echo not open" state the spec asks for):

1. Press the Recents button (or swipe up and hold) and swipe Echo away.
2. Open Chrome and go to any long web page, such as a Wikipedia article.

**Open the Echo notification:**

1. Swipe down from the top of the screen.
2. Find the Echo notification. If you do not see the **🎤 Talk** and **✏️ Type** buttons, drag that notification
   downwards with one finger to expand it. They only show when it is expanded.

### Things that are normal, so do not report them

- A green dot or microphone icon at the top of the screen during a call.
- The glow, pill and red button do not show on the lock screen. Android does not allow them there.
- After you end a call, the "On a call with Echo" notification can stay for about 6 seconds while Echo saves. If you tap
  Talk during that time, you get the message "Echo is finishing your last call." **Wait 10 seconds between calls.**
- A call stops by itself after about 10 minutes, with "The call dropped" in the pill for about 3 seconds. That is the
  voice service's time limit.
- If the pill says "Echo's voice reached today's limit", the free voice quota has run out for the day. Carry on with the
  Type items and finish the Talk items tomorrow.
- A quiet "Echo bubble is on" notification while the chathead is showing.

---

## Part 1: Permission

### 1. First-time "Display over other apps" permission

- [ ] Pass

The permission may already be on from earlier testing, so turn it off first.

1. Open the phone's **Settings** app and type `Display over other apps` in its search box. Open the result and tap
   **Echo**. Turn the switch **off**.
2. Go to the start position, open the Echo notification, and tap **🎤 Talk**.
3. **You should see:** the short message "Allow Echo to display over other apps, then tap again." and the Android settings
   page for this permission, with Echo's switch showing. No call starts and there is no glow.
4. Turn the switch **on**.
5. Press Back until you are in Chrome. Nothing starts by itself, which is correct.
6. Open the Echo notification and tap **🎤 Talk** again.
7. **You should see:** the glow, the red button and the pill. Tap the red button to end the call.
8. Turn the switch off again. Open the Echo notification and tap **✏️ Type**.
9. **You should see:** the same message and settings page. Turn the switch on, go back, and tap **✏️ Type** again.
10. **You should see:** the round Echo chathead. Drag it to the ✕ at the bottom to remove it.

**If it fails, report:** which step went wrong, whether the settings page opened at all, whether it showed Echo's switch
or a general list of apps, and whether the switch was greyed out. If nothing works without this permission, stop here.

---

## Part 2: Talk

### 2. Talk connects, and you can hear each other (Spec success 1)

- [ ] Pass

1. Go to the start position. Open the Echo notification and tap **🎤 Talk**.
2. **You should see:** the notification shade close and Chrome stay on the screen. A neon green glow pulses around the
   whole screen edge. A round red button sits at the bottom centre, with a small dark pill above it saying "Connecting…",
   then "Listening".
3. If Android asks for microphone permission, allow it.
4. Say "Hello Echo, can you hear me?"
5. **You should see and hear:** the pill changes to "Thinking", then "Echo is speaking", and you hear Echo's voice reply to
   what you said. Afterwards the pill goes back to "Listening".
6. Tap the red button.

**If it fails, report:** the last words the pill showed, whether you heard Echo, and whether Echo answered what you
really said (that shows it can hear you).

### 3. The app does not flash when you tap Talk

- [ ] Pass

1. Go to the start position.
2. Open the Echo notification and tap **🎤 Talk**. Keep your eyes on the screen.
3. **You should see:** only Chrome, then the glow appearing over it. The Echo app, the Echo splash screen, and a black or
   white blink should never appear.
4. Tap the red button and wait 10 seconds.
5. Do this 5 times in total. Try it from one other app too, such as Gallery, and from the home screen.

A short wait before the glow appears is fine. What must not happen is the screen changing.

**If it fails, report:** what you saw (Echo's screen, a logo, or a black or white blink), about how long it lasted, how
many of the 5 tries it happened on, and which app you started from. A screen recording or a phone video of it helps a lot.

### 4. You can use the app behind the glow (Spec success 2)

- [ ] Pass

1. Start a call from Chrome as in item 2 and wait for "Listening".
2. Scroll the web page up and down with your finger.
3. Tap a link on the page. Tap the address bar, then press Back.
4. Scroll with your finger starting right at the edge of the screen, on top of the glow.
5. **You should see:** Chrome reacts every time, as if the glow were not there, and the call keeps running.

Keep the call going for the next item.

**If it fails, report:** which touches did not work (all of them, or only in one area), and whether a message appeared
saying a screen overlay was detected.

### 5. Taps near the exit button reach the app behind

- [ ] Pass

1. With the call still running, press the Home button. The glow stays.
2. Look for an app icon or dock icon just to the left or right of the red button. If none is close, swipe to a home screen
   page that has one, or use Chrome and find a link next to the red button by scrolling.
3. Tap that icon or link as close to the red button as you can without touching the red circle.
4. **You should see:** the app or link opens, and the call keeps going.
5. Go back. Now tap directly on the dark pill above the red button, with something tappable behind it if you can.
6. **You should see:** the tap goes to whatever is behind the pill. The pill does nothing and the call does not end.

**If it fails, report:** where you tapped (left, right, above, or below the button), and whether the tap did nothing or
ended the call by mistake. A screenshot with your tap spot described is ideal.

### 6. Exit ends the call and removes everything (Spec success 3)

- [ ] Pass

1. With the call still running, tap the red button once.
2. **You should see:** the glow, pill and button all vanish at once, and Echo stops talking and listening.
3. Wait 10 seconds, then swipe down from the top.
4. **You should see:** the "On a call with Echo" notification has gone, and so has the green microphone dot. The normal
   Echo notification is still there.

**If it fails, report:** which part stayed behind (glow, pill, button, notification, microphone dot, or Echo's voice) and
for how long.

### 7. The call survives switching apps and 2 minutes with the screen off (Spec success 4)

- [ ] Pass

1. Go to the start position and start a call. Wait for "Listening".
2. Press Home. Open another app. Use Recents to go back to Chrome. Say "Are you still there?" after each change.
3. **You should see and hear:** the glow stays through every switch, and Echo answers each time.
4. Press the power button to turn the screen off. Time 2 minutes on a clock or another device. Leave the phone alone.
5. With the screen still off, say "Are you still there?"
6. **You should hear:** Echo answers.
7. Press power and unlock the phone. **You should see:** the glow and red button are back, and the pill shows the call state.
8. Tap the red button.

**If it fails, report:** at which step the call stopped, what the pill said, and whether the glow stayed on with no voice
(a silent call) or everything vanished.

### 8. The call keeps working with the screen off for more than 5 minutes

- [ ] Pass

Keep this under 10 minutes in total, because of the call time limit.

1. Make sure the phone is not charging. Being unplugged is the harder case.
2. Go to the start position and start a call. Say "Hello" and wait for the answer.
3. Press the power button to turn the screen off. Time **6 minutes**. Leave the phone alone on a table.
4. With the screen still off, say "Tell me a very short joke."
5. **You should hear:** Echo answers.
6. Press power and unlock the phone. **You should see:** the glow, the red button and the pill are all still there.
7. Tap the red button.

**If it fails, report:** how long it lasted if you know, whether Echo stayed silent or the whole call had gone after
unlocking, what the pill showed, whether the phone was charging, and whether Echo was still in the notification shade.
Connect the phone for logs straight away, because this is the failure TECNO phones are most likely to cause.

### 9. "End call" in the call notification, unlocked and from the lock screen

- [ ] Pass (unlocked)
- [ ] Pass (lock screen)

**Unlocked:**

1. Go to the start position and start a call. Wait for "Listening".
2. Swipe down from the top. Find **On a call with Echo**. If you do not see **End call**, drag the notification down to
   expand it.
3. Tap **End call**.
4. **You should see:** the glow, pill and button vanish, Echo stops, and within about 6 seconds the notification goes.

**Lock screen:** wait 10 seconds first.

1. Start a call again and wait for "Listening".
2. Press power to turn the screen off, then press it again to wake the screen. Do **not** unlock.
3. **You should see:** "On a call with Echo" on the lock screen, with **End call** on it. You may need to drag it down to
   expand it.
4. Tap **End call**. The phone may ask you to unlock first. That is acceptable if the call then ends.
5. **You should hear:** Echo stops.
6. Unlock the phone. **You should see:** no glow, pill or button, and within about 6 seconds no call notification.

If nothing shows on the lock screen, check the phone's lock screen notification setting first (search `lock screen` in
Settings) and allow notifications there, then try again.

**If it fails, report:** whether the notification showed on the lock screen, whether the End call button showed, whether
the phone asked you to unlock, and whether the call really stopped. If you could not end the call from the lock screen,
say so clearly, because overlays do not show there and End call is the only way out.

### 10. Something saved by voice appears in the app and the notification (Spec success 5)

- [ ] Pass

1. Go to the start position and start a call. Wait for "Listening".
2. Say "Please save a note called Purple Banana. It says I tested the floating call today."
3. Wait for Echo to confirm that it saved the note, then wait 5 more seconds.
4. Tap the red button. Wait 10 seconds.
5. Open the Echo notification and tap its **Notes** tab.
6. **You should see:** "Purple Banana" in the list.
7. Open the Echo app and tap **Notes** at the bottom. **You should see:** the Purple Banana note.
8. Tap **Diary** at the bottom. **You should see:** today's page shows what was said in the call.

**If it fails, report:** whether Echo said it saved the note, and which places are missing it (notification, Notes page,
Diary). If only the notification is missing it, say whether it turned up after you opened the Echo app.

---

## Part 3: Type

### 11. The chathead (Spec success 6)

- [ ] Pass

1. Go to the start position. Open the Echo notification and tap **✏️ Type**.
2. **You should see:** a round Echo icon (teal circle, dark star) on the right edge of the screen, floating over Chrome.
   The Echo app does not open, and the diary does not open by itself.
3. Open the Echo notification and tap **✏️ Type** again. **You should see:** the same single chathead, in the same place.
4. **Drag:** hold the chathead and move it around. **You should see:** it follows your finger, and an ✕ appears at the
   bottom centre of the screen.
5. **Snap:** let go in the left half of the screen, away from the ✕. **You should see:** it jumps to the left edge. Do the
   same in the right half, and it jumps to the right edge.
6. **Survives switching:** press Home, then open another app. **You should see:** the chathead stays.
7. **Open:** tap the chathead. **You should see:** the screen behind goes dark, and a window opens with "Diary" at the top,
   "Open in app ↗" at the top right, and today's diary page below. There is no sidebar and no tab bar.
8. **Send:** tap the message box, type `Hello from the bubble`, and send it. **You should see:** your message, then Echo's
   reply, in the window.
9. **Shrink three ways.** Tap the chathead: the window closes. Tap the chathead to open it, then tap the dark area outside
   the window: it closes. Tap the chathead to open it, then press Back: it closes. The chathead stays each time.
10. **Remove:** drag the chathead onto the ✕ and let go. **You should see:** the chathead and the ✕ both disappear, and
    the chathead does not come back by itself.
11. Tap **✏️ Type** on the notification. **You should see:** the chathead comes back.

**If it fails, report:** the step number and what happened instead. If the window opened but was empty, or showed a sign-in
page, say so.

### 12. The keyboard works in the diary window

- [ ] Pass

1. Tap the chathead to open the window.
2. Tap the message box.
3. **You should see:** the keyboard slide up, and the message box stays visible above it, so you can see what you type.
4. Type a few words, delete one, and type again. Try a voice-typing or emoji key if your keyboard has one.
5. Press Back once to hide the keyboard, or tap the chathead, whichever you prefer.
6. **You should see:** nothing is stuck. You can still tap the window, or close it with the chathead.

**If it fails, report:** whether the keyboard appeared at all, whether the letters reached the box, and whether the
keyboard covered the box. Also say whether one Back press hid only the keyboard or closed the whole window.

### 13. Open in app lands on the diary (Spec success 7)

- [ ] Pass

1. From Chrome, tap the chathead to open the window.
2. Tap **Open in app ↗**.
3. **You should see:** the full Echo app opens on the **Diary** page, and the floating window closes. The chathead stays
   as a small bubble.
4. Your `Hello from the bubble` message and Echo's reply from item 11 show in the diary.

**If it fails, report:** which page Echo opened on, and whether the chathead stayed, the window stayed open, or the message
was missing.

### 14. Rotating the phone with the chathead showing

- [ ] Pass

1. Swipe down the quick settings and turn on **Auto-rotate**.
2. Open Chrome, which turns sideways even if your home screen does not. Make sure the chathead is showing.
3. Turn the phone sideways. **You should see:** the chathead is on screen, at the left or right edge, not cut off or lost.
4. Drag it around and let go. **You should see:** it snaps to the left or right edge of the sideways screen, and the ✕
   appears at the bottom centre.
5. Tap the chathead. **You should see:** the window opens, fits the sideways screen, and closes normally.
6. With the window **open**, turn the phone back upright. **You should see:** the window closes by itself, which is
   intended. The chathead is still on screen.
7. Tap the chathead. **You should see:** the window opens at the right size for upright.
8. Drag the chathead to the ✕ and check that it can still be removed.
9. Turn off Auto-rotate if you do not normally use it.

**If it fails, report:** which way the phone was turned, where the chathead ended up (a screenshot helps), and whether the
window was the wrong size, the ✕ was in the wrong place, or Echo crashed.

---

## Part 4: Talk and Type together

### 15. Talk and chathead at the same time

- [ ] Pass

1. Go to the start position. Tap **✏️ Type** on the notification to show the chathead.
2. Open the Echo notification and tap **🎤 Talk**.
3. **You should see:** the glow, button and pill appear, and the chathead stays. Both are on screen together.
4. Say hello and check that Echo answers.
5. Tap the chathead. **You should see:** the diary window opens, and the call keeps going behind it. You may hear Echo
   while the window is open.
6. Type a message and send it. **You should see:** Echo replies in the window, and the call does not end.
7. Close the window. Open the Echo notification and tap **🎤 Talk** again. **You should see:** nothing new, and no second
   voice.
8. Tap the red button. **You should see:** the glow, pill and button go, and the chathead stays.

**If it fails, report:** the step number, and whether the call ended, the chathead vanished, or you heard two voices.

### 16. Opening the full app during a floating call

- [ ] Pass

1. Go to the start position and start a call. Wait for "Listening".
2. Press Home and tap the Echo icon to open the full app.
3. **You should see:** Echo opens, the glow and red button are still there, and the call keeps going. Say something to
   check.
4. On the **Diary** page, tap the phone icon ("Call Echo") next to the message box.
5. **You should see:** a short message, "Echo is already in a call from the floating bubble. End that call first." You
   do not hear a second voice.
6. Tap the red button to end the floating call. Wait 10 seconds.
7. Tap the phone icon again. **You should see:** the normal in-app call starts.
8. While that in-app call runs, open the Echo notification and tap **🎤 Talk**.
9. **You should see:** the message "You're already on a call in Echo." No glow, and no second call.
10. End the in-app call in the app.

**If it fails, report:** the step number, and whether you heard two voices, the call ended by itself, or the phone icon did
nothing and showed no message. If there is no phone icon at all, say that too, and check that voice is on in Settings.

### 17. Force-stopping Echo leaves no stray glow, and the next tap works

- [ ] Pass

1. Go to the start position. Tap **✏️ Type** to show the chathead, then tap **🎤 Talk**. Wait for "Listening".
2. Press Home. Long-press the Echo icon and tap **App info**.
3. Tap **Force stop**, then **OK**. If the red button is sitting on top of Force stop, scroll the page a little. If you end
   the call by accident, start again from step 1.
4. **You should see:** straight away the glow, pill, red button and chathead are all gone, and Echo stops talking.
5. Swipe down from the top. **You should see:** no call notification and no "Echo bubble is on". The normal Echo
   notification has gone too. Android removes it when an app is force-stopped.
6. Wait 30 seconds and look around. **You should see:** no glow or chathead comes back by itself.
7. Open the Echo app from the home screen. Wait for it to load. **You should see:** the Echo notification comes back.
8. Go to the start position, open the Echo notification, and tap **🎤 Talk**.
9. **You should see:** a normal call. No "finishing your last call" message, and no "already on a call" message.
10. Tap the red button. Wait 10 seconds. Tap **✏️ Type**. **You should see:** the chathead appears.
11. Drag the chathead to the ✕.

**If it fails, report:** what stayed on screen after the force stop, or which tap did not work afterwards and any message
it showed. If a glow gets stuck on screen, restart the phone and tell us.

---

## Part 5: Icon

### 18. The home screen shows the Echo icon (Spec success 8)

- [ ] Pass

1. Press Home and find Echo on the home screen and in the app drawer.
2. **You should see:** Echo's own icon: a dark background with a teal circle and a dark star. It should not be the green
   Android robot or a white square, and the star should not be cut off.
3. Open Recents and look at Echo's icon there too.
4. If the old icon still shows, restart the phone once, because home screens sometimes keep old icons, then check again.

**If it fails, report:** a screenshot, and where the icon looks wrong.

---

## How to report a bug

Keep it short. For each bug, send these two things:

1. **What you did:** the item and step number, and the app you were in. For example: "Item 8, step 4, from Chrome".
2. **What you saw:** what happened instead, and the exact words of any message. Say whether it happens every time or only
   sometimes. A screenshot (hold power and volume down) or a screen recording helps a lot.

### Optional: send the logs

The logs show what Echo was doing inside. They are most useful for crashes, and for calls that stop by themselves.

The first time only, turn on USB debugging: open **Settings**, then **About phone**, tap **Build number** 7 times, go back
to **Settings**, open **System** then **Developer options** (or search for `Developer options`), and turn on **USB
debugging**. When you connect the phone, tap **Allow** on the phone.

1. Connect the phone to the PC by USB.
2. In Git Bash on the PC, clear the old logs:

   ```
   adb -s 138462554Y004657 logcat -c
   ```

3. Do the failing steps again on the phone. (You can unplug the phone for this and reconnect it afterwards. The phone
   keeps the logs for a little while, so connect again straight away.)
4. Save the logs to your Desktop:

   ```
   adb -s 138462554Y004657 logcat -d -s FloatingCall Chathead FloatLaunch AndroidRuntime > ~/Desktop/echo-log.txt
   adb -s 138462554Y004657 logcat -d > ~/Desktop/echo-log-full.txt
   ```

5. Send both files with your report. `FloatingCall` is the voice call, `Chathead` is the bubble, `FloatLaunch` is the Talk
   and Type tap, and `AndroidRuntime` shows crashes.

The first file may be nearly empty, because Echo only logs when something goes wrong. That is why the second file is
useful. The full log covers the whole phone, so do not post it anywhere public.
