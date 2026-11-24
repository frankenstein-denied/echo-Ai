package com.echo.app.floating;

import com.echo.app.echo.FirestoreJson;
import java.util.Calendar;
import java.util.TimeZone;

/**
 * Pure pacing for check-ins: each ignored one doubles the wait before the next (up to 8 hours), an answer
 * brings back the user's own gap, and at most five come in one local day. Nothing is due in sleep time.
 */
public final class CheckInPacing {
    /** The longest a run of ignored check-ins can stretch the gap to. */
    public static final int MAX_GAP_MINUTES = 8 * 60;
    public static final int MAX_PER_DAY = 5;

    private static final long MINUTE_MS = 60_000L;

    private CheckInPacing() {}

    /**
     * The gap before the next check-in: the user's own after an answer (0 ignored), doubled for each ignored
     * one in a row, never above 8 hours. A gap the user set longer than that is kept as it is.
     */
    public static int nextGapMinutes(int normalGap, int ignoredInARow) {
        if (ignoredInARow <= 0 || normalGap >= MAX_GAP_MINUTES) return normalGap;
        long gap = normalGap;
        for (int i = 0; i < ignoredInARow && gap < MAX_GAP_MINUTES; i++) gap *= 2;
        return (int) Math.min(gap, MAX_GAP_MINUTES);
    }

    public static boolean allowedToday(int countToday, int max) {
        return countToday < max;
    }

    /** The stored count if it belongs to the local day of nowMs; a new day starts again at 0. */
    public static int countToday(String countDay, int storedCount, long nowMs, TimeZone tz) {
        return FirestoreJson.dateKey(nowMs, tz).equals(countDay) ? Math.max(0, storedCount) : 0;
    }

    /** The gap has run out and it is not sleep time. */
    public static boolean isDue(long lastFiredMs, int gapMinutes, long nowMs, TimeZone tz, int sleepStartMin,
                                int sleepEndMin) {
        if (CheckInRules.inSleep(CheckInPlanner.minuteOfDay(nowMs, tz), sleepStartMin, sleepEndMin)) return false;
        return nowMs - lastFiredMs >= gapMinutes * MINUTE_MS;
    }

    /**
     * When the alarm should next go off. With today's check-ins used up, the next one waits for the start of
     * the next local day, moved on past sleep; keepAlive still looks in on the bubble every 15 minutes.
     */
    public static long nextAlarmMs(long lastFiredMs, int gapMinutes, long nowMs, int sleepStartMin, int sleepEndMin,
                                   TimeZone tz, boolean keepAlive, boolean capReached) {
        if (!capReached) {
            return CheckInRules.nextAlarmMs(lastFiredMs, gapMinutes, nowMs, sleepStartMin, sleepEndMin, tz, keepAlive);
        }
        long checkIn = CheckInRules.afterSleep(startOfNextDay(nowMs, tz), tz, sleepStartMin, sleepEndMin);
        return keepAlive ? Math.min(checkIn, nowMs + CheckInRules.KEEP_ALIVE_MS) : checkIn;
    }

    static long startOfNextDay(long nowMs, TimeZone tz) {
        Calendar c = Calendar.getInstance(tz);
        c.setTimeInMillis(nowMs);
        c.set(Calendar.HOUR_OF_DAY, 0);
        c.set(Calendar.MINUTE, 0);
        c.set(Calendar.SECOND, 0);
        c.set(Calendar.MILLISECOND, 0);
        c.add(Calendar.DAY_OF_YEAR, 1);
        return c.getTimeInMillis();
    }
}
