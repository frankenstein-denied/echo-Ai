package com.echo.app.floating;

import static com.echo.app.floating.CheckInRules.Outcome.*;
import static com.echo.app.floating.CheckInRules.decide;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class CheckInRulesTest {
    private static final long MINUTE_MS = 60_000L;
    private static final long NOW_MS = 1_000_000_000L;

    /** Noon, bubble running, nothing in the way, exactly one gap after the last check-in. */
    private static CheckInRules.State dueAndClear() {
        CheckInRules.State s = new CheckInRules.State();
        s.enabled = true;
        s.signedIn = true;
        s.bubbleRunning = true;
        s.screenOn = true;
        s.inCall = false;
        s.appInForeground = false;
        s.online = true;
        s.panelOpen = false;
        s.pendingWrite = false;
        s.nowMs = NOW_MS;
        s.lastFiredMs = NOW_MS - 120 * MINUTE_MS;
        s.everyMinutes = 120;
        s.minuteOfDay = 12 * 60;
        s.sleepStartMin = 1320;
        s.sleepEndMin = 420;
        s.quietUnread = 0;
        return s;
    }

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

    @Test public void sleepInsideOneDayExcludesItsEnd() {
        assertTrue(CheckInRules.inSleep(30, 30, 120));
        assertFalse(CheckInRules.inSleep(120, 30, 120));
        assertFalse(CheckInRules.inSleep(29, 30, 120));
    }

    @Test public void offOrSignedOutGetsNothing() {
        CheckInRules.State off = dueAndClear();
        off.enabled = false;
        assertEquals(OFF, decide(off));

        CheckInRules.State signedOut = dueAndClear();
        signedOut.signedIn = false;
        assertEquals(OFF, decide(signedOut));

        CheckInRules.State offAtNight = dueAndClear();
        offAtNight.enabled = false;
        offAtNight.minuteOfDay = 23 * 60;
        assertEquals(OFF, decide(offAtNight));
    }

    @Test public void neverFiresWhileAsleepEvenIfOverdue() {
        CheckInRules.State s = dueAndClear();
        s.minuteOfDay = 23 * 60;
        s.lastFiredMs = NOW_MS - 600 * MINUTE_MS;
        assertEquals(SLEEPING, decide(s));

        s.bubbleRunning = false;
        assertEquals(SLEEPING, decide(s));
    }

    @Test public void waitsForCallAppAndLockedScreen() {
        assertEquals(POPUP, decide(dueAndClear()));

        CheckInRules.State call = dueAndClear();
        call.inCall = true;
        assertEquals(WAIT, decide(call));

        CheckInRules.State app = dueAndClear();
        app.appInForeground = true;
        assertEquals(WAIT, decide(app));

        CheckInRules.State locked = dueAndClear();
        locked.screenOn = false;
        assertEquals(WAIT, decide(locked));
    }

    @Test public void offlineWaitsOnBothPaths() {
        CheckInRules.State bubbleOn = dueAndClear();
        bubbleOn.online = false;
        assertEquals(WAIT, decide(bubbleOn));

        CheckInRules.State bubbleOff = dueAndClear();
        bubbleOff.online = false;
        bubbleOff.bubbleRunning = false;
        assertEquals(WAIT, decide(bubbleOff));
    }

    @Test public void unsavedCheckInBlocksTheNextOne() {
        CheckInRules.State s = dueAndClear();
        s.pendingWrite = true;
        assertEquals(WAIT, decide(s));

        s.bubbleRunning = false;
        assertEquals(WAIT, decide(s));
    }

    @Test public void panelOpenGoesStraightToChat() {
        CheckInRules.State s = dueAndClear();
        s.panelOpen = true;
        assertEquals(CHAT_ONLY, decide(s));
    }

    @Test public void callStillBeatsAnOpenPanel() {
        CheckInRules.State s = dueAndClear();
        s.panelOpen = true;
        s.inCall = true;
        assertEquals(WAIT, decide(s));
    }

    @Test public void quietStopsAtOneUnread() {
        CheckInRules.State s = dueAndClear();
        s.bubbleRunning = false;
        s.quietUnread = 0;
        assertEquals(QUIET, decide(s));

        s.quietUnread = 1;
        assertEquals(WAIT, decide(s));
    }

    @Test public void quietIgnoresCallAppAndLockedScreen() {
        CheckInRules.State s = dueAndClear();
        s.bubbleRunning = false;
        s.inCall = true;
        s.appInForeground = true;
        s.screenOn = false;
        assertEquals(QUIET, decide(s));
    }

    @Test public void gapIsMeasuredFromLastCheckIn() {
        CheckInRules.State s = dueAndClear();
        s.lastFiredMs = NOW_MS - 119 * MINUTE_MS;
        assertEquals(NOT_DUE, decide(s));

        s.lastFiredMs = NOW_MS - 120 * MINUTE_MS;
        assertEquals(POPUP, decide(s));
    }

    @Test public void removedBubbleStaysRemoved() {
        assertFalse(CheckInRules.shouldStartBubble(true, true, true, true));
        assertTrue(CheckInRules.shouldStartBubble(true, true, true, false));
        assertFalse(CheckInRules.shouldStartBubble(true, true, false, false));
    }

    @Test public void bubbleNeedsCheckInsOnAndSignIn() {
        assertFalse(CheckInRules.shouldStartBubble(false, true, true, false));
        assertFalse(CheckInRules.shouldStartBubble(true, false, true, false));
    }
}
