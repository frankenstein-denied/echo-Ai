package com.echo.app.floating;

import static org.junit.Assert.*;

import android.media.AudioManager;
import com.echo.app.echo.CheckInPrefs;
import java.util.TimeZone;
import org.junit.After;
import org.junit.Test;

public class CheckInEngineTest {
    private static final long MIN = 60_000L;
    private static final long LAST = 1_000_000_000L;
    private static final TimeZone UTC = TimeZone.getTimeZone("UTC");

    @Test public void phoneAndAppCallsShowInTheAudioMode() {
        assertTrue(CheckInEngine.callAudioMode(AudioManager.MODE_IN_CALL));
        assertTrue(CheckInEngine.callAudioMode(AudioManager.MODE_IN_COMMUNICATION));
        assertTrue(CheckInEngine.callAudioMode(AudioManager.MODE_RINGTONE));
        assertFalse(CheckInEngine.callAudioMode(AudioManager.MODE_NORMAL));
    }

    @After public void clearFlags() {
        FloatState.callRunning = false;
        FloatState.appCallActive = false;
        FloatState.callFinishing = false;
    }

    private static TodaySnapshot snapshot(String day, long fetchedAtMs) {
        TodaySnapshot s = new TodaySnapshot();
        s.dateKey = day;
        s.fetchedAtMs = fetchedAtMs;
        return s;
    }

    private static CheckInPrefs prefs(boolean enabled, boolean onboarded) {
        CheckInPrefs p = CheckInPrefs.defaults();
        p.enabled = enabled;
        p.onboarded = onboarded;
        return p;
    }

    @Test public void prefetchWaitsUntilFiveMinutesBeforeDue() {
        assertEquals(115 * MIN, CheckInEngine.msUntilPrefetch(LAST, 120, LAST));
        assertEquals(MIN, CheckInEngine.msUntilPrefetch(LAST, 120, LAST + 114 * MIN));
    }

    @Test public void prefetchIsZeroInsideTheWindowAndNeverNegative() {
        assertEquals(0, CheckInEngine.msUntilPrefetch(LAST, 120, LAST + 115 * MIN));
        assertEquals(0, CheckInEngine.msUntilPrefetch(LAST, 120, LAST + 118 * MIN));
        assertEquals(0, CheckInEngine.msUntilPrefetch(LAST, 120, LAST + 500 * MIN));
    }

    @Test public void tickIsAMinuteApartUnlessACheckInFallsDueSooner() {
        assertEquals(MIN, CheckInEngine.msUntilNextTick(LAST, 120, LAST));
        assertEquals(20_000L, CheckInEngine.msUntilNextTick(LAST, 120, LAST + 120 * MIN - 20_000L));
    }

    @Test public void tickStaysAMinuteApartOnceDue() {
        assertEquals(MIN, CheckInEngine.msUntilNextTick(LAST, 120, LAST + 120 * MIN));
        assertEquals(MIN, CheckInEngine.msUntilNextTick(LAST, 120, LAST + 300 * MIN));
    }

    @Test public void onlyAllowedGapsAreUsed() {
        for (int gap : new int[] {30, 60, 120, 180, 240, 360}) assertEquals(gap, CheckInEngine.allowedGap(gap));
        for (int gap : new int[] {0, -30, 45, 361}) assertEquals(120, CheckInEngine.allowedGap(gap));
    }

    @Test public void lastFiredSeedsWhenUnsetAndClampsWhenInTheFuture() {
        assertEquals(LAST, CheckInEngine.effectiveLastFired(0, LAST));
        assertEquals(LAST, CheckInEngine.effectiveLastFired(LAST + 1, LAST));
        assertEquals(LAST - 1, CheckInEngine.effectiveLastFired(LAST - 1, LAST));
    }

    @Test public void baseStateCopiesPrefsAndUsesLocalMinute() {
        CheckInPrefs p = prefs(true, true);
        p.everyMinutes = 45;
        p.sleepStartMin = 100;
        p.sleepEndMin = 200;
        long now = 90 * MIN; // 01:30 on 1 Jan 1970, UTC
        CheckInRules.State s = CheckInEngine.baseState(p, now, 5, UTC);
        assertTrue(s.enabled);
        assertEquals(120, s.everyMinutes);
        assertEquals(100, s.sleepStartMin);
        assertEquals(200, s.sleepEndMin);
        assertEquals(90, s.minuteOfDay);
        assertEquals(now, s.nowMs);
        assertEquals(5, s.lastFiredMs);
    }

    @Test public void aLockedScreenCountsAsOff() {
        assertTrue(CheckInEngine.screenUsable(true, false));
        assertFalse(CheckInEngine.screenUsable(true, true));
        assertFalse(CheckInEngine.screenUsable(false, false));
        assertFalse(CheckInEngine.screenUsable(false, true));
    }

    @Test public void anyCallFlagMeansInCall() {
        assertFalse(CheckInEngine.inCall());
        FloatState.callRunning = true;
        assertTrue(CheckInEngine.inCall());
        clearFlags();
        FloatState.appCallActive = true;
        assertTrue(CheckInEngine.inCall());
        clearFlags();
        FloatState.callFinishing = true;
        assertTrue(CheckInEngine.inCall());
    }

    @Test public void freshSnapshotIsUsedWithOrWithoutTheFallback() {
        TodaySnapshot s = snapshot("2026-11-06", LAST);
        assertSame(s, CheckInEngine.pickSnapshot(s, "2026-11-06", LAST + MIN, false));
        assertSame(s, CheckInEngine.pickSnapshot(s, "2026-11-06", LAST + MIN, true));
    }

    @Test public void oldSnapshotFromTodayNeedsTheUnlockFallback() {
        TodaySnapshot s = snapshot("2026-11-06", LAST);
        long now = LAST + 121 * MIN;
        assertNull(CheckInEngine.pickSnapshot(s, "2026-11-06", now, false));
        assertSame(s, CheckInEngine.pickSnapshot(s, "2026-11-06", now, true));
    }

    @Test public void snapshotFromAnotherDayIsNeverUsed() {
        TodaySnapshot s = snapshot("2026-11-05", LAST);
        assertNull(CheckInEngine.pickSnapshot(s, "2026-11-06", LAST, false));
        assertNull(CheckInEngine.pickSnapshot(s, "2026-11-06", LAST, true));
        assertNull(CheckInEngine.pickSnapshot(null, "2026-11-06", LAST, true));
    }

    @Test public void messageIdCarriesItsDayAndIsUnique() {
        String a = CheckInEngine.newMessageId("2026-11-06");
        assertEquals("2026-11-06", CheckInEngine.pendingDay(a));
        assertNotEquals(a, CheckInEngine.newMessageId("2026-11-06"));
        assertEquals(-1, a.indexOf('/'));
    }

    @Test public void pendingFromAnEarlierDayOrHalfSavedIsNotKept() {
        String id = CheckInEngine.newMessageId("2026-11-06");
        assertTrue(CheckInEngine.pendingIsKept(id, "text", "2026-11-06"));
        assertFalse(CheckInEngine.pendingIsKept(id, "text", "2026-11-07"));
        assertFalse(CheckInEngine.pendingIsKept(id, null, "2026-11-06"));
        assertFalse(CheckInEngine.pendingIsKept(null, "text", "2026-11-06"));
        assertFalse(CheckInEngine.pendingIsKept("no-date", "text", "2026-11-06"));
    }

    @Test public void visibleTimeCountsFromDueOrFromTheUnlockWhicheverIsLater() {
        long due = LAST + 120 * MIN;
        assertEquals(due, CheckInEngine.visibleFromMs(LAST, 120, 0));
        assertEquals(due, CheckInEngine.visibleFromMs(LAST, 120, due - 1));
        assertEquals(due + 5, CheckInEngine.visibleFromMs(LAST, 120, due + 5));
    }

    @Test public void storedTopicReadsBackOrIsNull() {
        assertEquals(CheckInPlanner.Topic.WATER, CheckInEngine.parseTopic("WATER"));
        assertNull(CheckInEngine.parseTopic("SOMETHING_OLD"));
        assertNull(CheckInEngine.parseTopic(null));
    }

    @Test public void bubbleAutoStartNeedsCachedPrefsAndOnboarding() {
        assertTrue(CheckInEngine.shouldAutoStart(prefs(true, true), true, true, false));
        assertFalse(CheckInEngine.shouldAutoStart(null, true, true, false));
        assertFalse(CheckInEngine.shouldAutoStart(prefs(true, false), true, true, false));
        assertFalse(CheckInEngine.shouldAutoStart(prefs(false, true), true, true, false));
        assertFalse(CheckInEngine.shouldAutoStart(prefs(true, true), false, true, false));
        assertFalse(CheckInEngine.shouldAutoStart(prefs(true, true), true, false, false));
        assertFalse(CheckInEngine.shouldAutoStart(prefs(true, true), true, true, true));
    }

    @Test public void turnedOnOnlyWhenItWasKnownToBeOff() {
        assertTrue(CheckInEngine.turnedOn(prefs(false, true), true));
        assertFalse(CheckInEngine.turnedOn(prefs(true, true), true));
        assertFalse(CheckInEngine.turnedOn(prefs(false, true), false));
        assertFalse(CheckInEngine.turnedOn(null, true));
    }
}
