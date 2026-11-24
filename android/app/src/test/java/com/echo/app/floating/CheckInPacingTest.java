package com.echo.app.floating;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.TimeZone;
import org.junit.Test;

public class CheckInPacingTest {
    private static final TimeZone MANILA = TimeZone.getTimeZone("GMT+08:00");
    private static final long MINUTE = 60_000L;
    /** 2026-11-06 10:00 in Manila. */
    private static final long NOV_6_10AM = 1793930400000L;
    private static final int SLEEP_START = 22 * 60;
    private static final int SLEEP_END = 7 * 60;

    private static long at(long dayStartTenAm, int hour, int minute) {
        return dayStartTenAm + ((hour - 10) * 60L + minute) * MINUTE;
    }

    @Test public void eachIgnoredCheckInDoublesTheGap() {
        assertEquals(120, CheckInPacing.nextGapMinutes(120, 0));
        assertEquals(240, CheckInPacing.nextGapMinutes(120, 1));
        assertEquals(480, CheckInPacing.nextGapMinutes(120, 2));
        assertEquals(60, CheckInPacing.nextGapMinutes(30, 1));
        assertEquals(8, CheckInPacing.nextGapMinutes(1, 3));
    }

    @Test public void theGapStopsAtEightHours() {
        assertEquals(480, CheckInPacing.nextGapMinutes(120, 3));
        assertEquals(480, CheckInPacing.nextGapMinutes(1, 100)); // no overflow
        assertEquals(480, CheckInPacing.nextGapMinutes(300, 1));
    }

    @Test public void aGapAlreadyLongerThanTheCapIsNeverShortened() {
        assertEquals(720, CheckInPacing.nextGapMinutes(720, 0));
        assertEquals(720, CheckInPacing.nextGapMinutes(720, 2));
    }

    @Test public void anAnswerBringsBackTheNormalGap() {
        // The engine stores 0 ignored after an answer; the gap is then the user's own again.
        assertEquals(1, CheckInPacing.nextGapMinutes(1, 0));
        assertEquals(120, CheckInPacing.nextGapMinutes(120, 0));
        assertEquals(120, CheckInPacing.nextGapMinutes(120, -1));
    }

    @Test public void atMostFiveADay() {
        assertTrue(CheckInPacing.allowedToday(0, 5));
        assertTrue(CheckInPacing.allowedToday(4, 5));
        assertFalse(CheckInPacing.allowedToday(5, 5));
        assertFalse(CheckInPacing.allowedToday(6, 5));
        assertEquals(5, CheckInPacing.MAX_PER_DAY);
    }

    @Test public void theCountResetsAtLocalMidnight() {
        long lateEvening = at(NOV_6_10AM, 23, 59);
        long justAfterMidnight = at(NOV_6_10AM, 24, 1);
        String day = com.echo.app.echo.FirestoreJson.dateKey(lateEvening, MANILA);
        assertEquals(5, CheckInPacing.countToday(day, 5, lateEvening, MANILA));
        assertEquals(0, CheckInPacing.countToday(day, 5, justAfterMidnight, MANILA));
        assertEquals(0, CheckInPacing.countToday(null, 3, lateEvening, MANILA));
    }

    @Test public void theCountUsesTheLocalDayNotUtc() {
        // 07:30 in Manila is still the previous day in UTC: the count belongs to the local day.
        long morning = at(NOV_6_10AM, 7, 30);
        assertEquals(2, CheckInPacing.countToday("2026-11-06", 2, morning, MANILA));
    }

    @Test public void nothingIsDueInsideSleepHours() {
        long lastFired = at(NOV_6_10AM, 21, 0);
        // Ignored twice on a 2 h gap: 8 h, so it falls due at 05:00, which is inside sleep.
        int gap = CheckInPacing.nextGapMinutes(120, 2);
        assertFalse(CheckInPacing.isDue(lastFired, gap, at(NOV_6_10AM, 29, 0), MANILA, SLEEP_START, SLEEP_END));
        assertFalse(CheckInPacing.isDue(lastFired, gap, at(NOV_6_10AM, 30, 59), MANILA, SLEEP_START, SLEEP_END));
        assertTrue(CheckInPacing.isDue(lastFired, gap, at(NOV_6_10AM, 31, 0), MANILA, SLEEP_START, SLEEP_END));
    }

    @Test public void notDueBeforeTheGapEnds() {
        long lastFired = at(NOV_6_10AM, 10, 0);
        assertFalse(CheckInPacing.isDue(lastFired, 240, at(NOV_6_10AM, 13, 59), MANILA, SLEEP_START, SLEEP_END));
        assertTrue(CheckInPacing.isDue(lastFired, 240, at(NOV_6_10AM, 14, 0), MANILA, SLEEP_START, SLEEP_END));
    }

    @Test public void aReachedCapWaitsForTheNextWakingDay() {
        long now = at(NOV_6_10AM, 15, 0);
        long next = CheckInPacing.nextAlarmMs(now - 10 * MINUTE, 60, now, SLEEP_START, SLEEP_END, MANILA, false, true);
        assertEquals(at(NOV_6_10AM, 31, 0), next); // 07:00 the next day, when sleep ends
    }

    @Test public void aReachedCapStillKeepsTheBubbleAlive() {
        long now = at(NOV_6_10AM, 15, 0);
        long next = CheckInPacing.nextAlarmMs(now, 60, now, SLEEP_START, SLEEP_END, MANILA, true, true);
        assertEquals(now + CheckInRules.KEEP_ALIVE_MS, next);
    }

    @Test public void withoutTheCapTheAlarmFollowsTheGap() {
        long now = at(NOV_6_10AM, 15, 0);
        assertEquals(CheckInRules.nextAlarmMs(now, 240, now, SLEEP_START, SLEEP_END, MANILA, false),
            CheckInPacing.nextAlarmMs(now, 240, now, SLEEP_START, SLEEP_END, MANILA, false, false));
    }

    @Test public void aReachedCapStopsCheckInsButSleepStillShows() {
        CheckInRules.State s = new CheckInRules.State();
        s.enabled = true;
        s.signedIn = true;
        s.online = true;
        s.nowMs = NOV_6_10AM;
        s.lastFiredMs = NOV_6_10AM - 600 * MINUTE;
        s.everyMinutes = 60;
        s.minuteOfDay = 10 * 60;
        s.sleepStartMin = SLEEP_START;
        s.sleepEndMin = SLEEP_END;
        s.capReached = true;
        assertEquals(CheckInRules.Outcome.CAPPED, CheckInRules.decide(s));
        assertFalse(CheckInRules.fires(CheckInRules.Outcome.CAPPED));
        s.minuteOfDay = 23 * 60;
        assertEquals(CheckInRules.Outcome.SLEEPING, CheckInRules.decide(s));
        s.minuteOfDay = 10 * 60;
        s.capReached = false;
        assertEquals(CheckInRules.Outcome.NOTIFY, CheckInRules.decide(s));
    }

    @Test public void aCappedWorkerRunKeepsTheAlarmLine() {
        assertTrue(CheckInRules.keepsLastWake("worker", "CAPPED", "alarm"));
    }
}
