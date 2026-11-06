package com.echo.app.floating;

import static com.echo.app.floating.CheckInRules.Outcome.*;
import static com.echo.app.floating.CheckInRules.decide;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.Calendar;
import java.util.TimeZone;
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

    @Test public void waitsForCallAndApp() {
        assertEquals(POPUP, decide(dueAndClear()));

        CheckInRules.State call = dueAndClear();
        call.inCall = true;
        assertEquals(WAIT, decide(call));

        CheckInRules.State app = dueAndClear();
        app.appInForeground = true;
        assertEquals(WAIT, decide(app));
    }

    @Test public void waitsForCallAndAppWithNoBubbleToo() {
        CheckInRules.State call = dueAndClear();
        call.bubbleRunning = false;
        call.inCall = true;
        assertEquals(WAIT, decide(call));

        CheckInRules.State app = dueAndClear();
        app.bubbleRunning = false;
        app.appInForeground = true;
        assertEquals(WAIT, decide(app));
    }

    @Test public void lockedOrOffScreenGetsANotificationNotAWait() {
        CheckInRules.State s = dueAndClear();
        s.screenOn = false;
        assertEquals(NOTIFY, decide(s));
    }

    @Test public void noBubbleGetsANotification() {
        CheckInRules.State s = dueAndClear();
        s.bubbleRunning = false;
        assertEquals(NOTIFY, decide(s));
    }

    @Test public void removedBubbleGoesQuietlyToChat() {
        CheckInRules.State s = dueAndClear();
        s.bubbleRunning = false;
        s.bubbleRemoved = true;
        assertEquals(QUIET, decide(s));

        s.screenOn = false;
        assertEquals(QUIET, decide(s));
    }

    @Test public void onlyRealSendsCountAsFiring() {
        assertTrue(CheckInRules.fires(POPUP));
        assertTrue(CheckInRules.fires(CHAT_ONLY));
        assertTrue(CheckInRules.fires(QUIET));
        assertTrue(CheckInRules.fires(NOTIFY));
        assertFalse(CheckInRules.fires(OFF));
        assertFalse(CheckInRules.fires(SLEEPING));
        assertFalse(CheckInRules.fires(NOT_DUE));
        assertFalse(CheckInRules.fires(WAIT));
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

    @Test public void panelOpenOnALockedPhoneStillNotifies() {
        CheckInRules.State s = dueAndClear();
        s.panelOpen = true;
        s.screenOn = false;
        assertEquals(NOTIFY, decide(s));
    }

    @Test public void standInStaysAwayFromCallsAndSleep() {
        assertTrue(CheckInRules.standInAllowed(false, false));
        assertFalse(CheckInRules.standInAllowed(true, false));
        assertFalse(CheckInRules.standInAllowed(false, true));
    }

    @Test public void callStillBeatsAnOpenPanel() {
        CheckInRules.State s = dueAndClear();
        s.panelOpen = true;
        s.inCall = true;
        assertEquals(WAIT, decide(s));
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

    // ---- the alarm ----

    private static final TimeZone TZ = TimeZone.getTimeZone("Asia/Manila");
    private static final int SLEEP_START = 22 * 60;
    private static final int SLEEP_END = 7 * 60;

    private static long at(int day, int hour, int minute) {
        Calendar c = Calendar.getInstance(TZ);
        c.clear();
        c.set(2026, Calendar.NOVEMBER, day, hour, minute, 0);
        return c.getTimeInMillis();
    }

    private static long alarm(long lastFiredMs, int everyMinutes, long nowMs, boolean keepAlive) {
        return CheckInRules.nextAlarmMs(lastFiredMs, everyMinutes, nowMs, SLEEP_START, SLEEP_END, TZ, keepAlive);
    }

    @Test public void alarmIsOneGapAfterTheLastCheckIn() {
        assertEquals(at(6, 14, 0), alarm(at(6, 12, 0), 120, at(6, 12, 0), false));
    }

    @Test public void alarmJustAheadIsNotPushedBack() {
        assertEquals(at(6, 14, 0), alarm(at(6, 12, 0), 120, at(6, 13, 59), false));
    }

    @Test public void alarmInSleepMovesToSleepEnd() {
        assertEquals(at(7, 7, 0), alarm(at(6, 21, 0), 120, at(6, 21, 0), false));
    }

    @Test public void alarmAfterMidnightInSleepStaysOnThatMorning() {
        assertEquals(at(7, 7, 0), alarm(at(6, 23, 30), 120, at(7, 1, 0), false));
    }

    @Test public void alarmExactlyAtSleepEndIsKept() {
        assertEquals(at(7, 7, 0), alarm(at(7, 5, 0), 120, at(7, 5, 0), false));
    }

    @Test public void alarmWithEqualSleepTimesNeverMoves() {
        long last = at(6, 23, 0);
        assertEquals(at(7, 1, 0), CheckInRules.nextAlarmMs(last, 120, last, 600, 600, TZ, false));
    }

    @Test public void overdueCheckInRetriesInsteadOfFiringAtOnce() {
        long now = at(6, 15, 0);
        assertEquals(now + 5 * MINUTE_MS, alarm(at(6, 12, 0), 120, now, false));
    }

    @Test public void checkInDueThisInstantStillRetries() {
        long now = at(6, 14, 0);
        assertEquals(now + 5 * MINUTE_MS, alarm(at(6, 12, 0), 120, now, false));
    }

    @Test public void overdueRetryDoesNotWakeTheUserInSleep() {
        assertEquals(at(7, 7, 0), alarm(at(6, 20, 0), 120, at(6, 23, 58), false));
    }

    @Test public void keepAliveComesFirstWhenTheCheckInIsFarOff() {
        long now = at(6, 12, 0);
        assertEquals(now + 15 * MINUTE_MS, alarm(now, 120, now, true));
    }

    @Test public void checkInComesFirstWhenItIsSoonerThanKeepAlive() {
        assertEquals(at(6, 14, 0), alarm(at(6, 12, 0), 120, at(6, 13, 50), true));
    }

    @Test public void keepAliveAndCheckInAtTheSameMoment() {
        assertEquals(at(6, 14, 0), alarm(at(6, 12, 0), 120, at(6, 13, 45), true));
    }

    @Test public void keepAliveRunsThroughSleep() {
        long now = at(7, 1, 0);
        assertEquals(now + 15 * MINUTE_MS, alarm(at(6, 21, 0), 120, now, true));
    }

    @Test public void keepAliveBeatsTheRetryOnlyWhenSooner() {
        long now = at(6, 15, 0);
        assertEquals(now + 5 * MINUTE_MS, alarm(at(6, 12, 0), 120, now, true));
    }

    @Test public void bubbleNeedsCheckInsOnAndSignIn() {
        assertFalse(CheckInRules.shouldStartBubble(false, true, true, false));
        assertFalse(CheckInRules.shouldStartBubble(true, false, true, false));
    }
}
