package com.echo.app.floating;

import com.echo.app.echo.FirestoreJson;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

/** Pure decisions for chathead check-ins: when one fires, and how it reaches the user. */
public final class CheckInRules {
    public enum Outcome {
        OFF,
        SLEEPING,
        NOT_DUE,
        WAIT,
        POPUP,
        CHAT_ONLY,
        NOTIFY
    }

    /** Everything {@link #decide} looks at, read fresh by the caller for each decision. */
    public static final class State {
        public boolean enabled;
        public boolean signedIn;
        public boolean bubbleRunning;
        /** On and unlocked. */
        public boolean screenOn;
        public boolean inCall;
        public boolean appInForeground;
        public boolean online;
        public boolean panelOpen;
        public boolean pendingWrite;
        public long nowMs;
        public long lastFiredMs;
        public int everyMinutes;
        public int minuteOfDay;
        public int sleepStartMin;
        public int sleepEndMin;
    }

    /** A bubble that should be up is looked at this often, day and night. */
    static final long KEEP_ALIVE_MS = 15 * 60_000L;

    public static final String WAKE_ALARM = "alarm";
    public static final String WAKE_WORKER = "worker";

    private static final long MINUTE_MS = 60_000L;
    private static final long WEEK_MS = 7 * 24 * 60 * MINUTE_MS;
    private static final int DAY_MINUTES = 24 * 60;
    /** A check-in that is due but had to wait. Keeps a waiting alarm from firing again at once. */
    private static final long RETRY_MS = MINUTE_MS;

    private CheckInRules() {}

    /** Start is inside the window, end is not. The window may cross midnight; equal times mean never. */
    public static boolean inSleep(int minuteOfDay, int startMin, int endMin) {
        if (startMin == endMin) return false;
        if (startMin < endMin) return minuteOfDay >= startMin && minuteOfDay < endMin;
        return minuteOfDay >= startMin || minuteOfDay < endMin;
    }

    public static Outcome decide(State s) {
        if (!s.enabled || !s.signedIn) return Outcome.OFF;
        if (inSleep(s.minuteOfDay, s.sleepStartMin, s.sleepEndMin)) return Outcome.SLEEPING;
        if (s.nowMs - s.lastFiredMs < s.everyMinutes * MINUTE_MS) return Outcome.NOT_DUE;
        if (!s.online || s.pendingWrite) return Outcome.WAIT;
        if (s.inCall || s.appInForeground) return Outcome.WAIT;
        if (s.panelOpen && s.screenOn) return Outcome.CHAT_ONLY; // on a locked phone nobody is reading it
        if (s.bubbleRunning && s.screenOn) return Outcome.POPUP;
        return Outcome.NOTIFY;
    }

    /** True for the outcomes that send a check-in. */
    public static boolean fires(Outcome o) {
        return o == Outcome.POPUP || o == Outcome.CHAT_ONLY || o == Outcome.NOTIFY;
    }

    /**
     * What to store as the last check-in, so lateness doesn't push every later one back: the latest
     * lastFiredMs + k * gap, k >= 1, that isn't after now. With no such time, or an unset or future
     * lastFiredMs, now. The next one falls due after now, so one wait can't fire twice.
     */
    static long anchoredFireMs(long lastFiredMs, int everyMinutes, long nowMs) {
        long gapMs = everyMinutes * MINUTE_MS;
        if (lastFiredMs <= 0 || lastFiredMs > nowMs || nowMs - lastFiredMs < gapMs) return nowMs;
        return lastFiredMs + (nowMs - lastFiredMs) / gapMs * gapMs;
    }

    /** Nothing fires in sleep time, so a moment inside it moves on to when sleep ends. */
    static long afterSleep(long ms, TimeZone tz, int sleepStartMin, int sleepEndMin) {
        int minute = CheckInPlanner.minuteOfDay(ms, tz);
        if (!inSleep(minute, sleepStartMin, sleepEndMin)) return ms;
        return ms + Math.floorMod(sleepEndMin - minute, DAY_MINUTES) * MINUTE_MS;
    }

    /**
     * When the alarm should next go off: the next check-in, or sooner for keepAlive, which ignores sleep
     * time because a dozing bubble stays up too. A check-in already due retries later, never at once.
     */
    public static long nextAlarmMs(long lastFiredMs, int everyMinutes, long nowMs, int sleepStartMin,
                                   int sleepEndMin, TimeZone tz, boolean keepAlive) {
        long due = lastFiredMs + everyMinutes * MINUTE_MS;
        long checkIn = afterSleep(due > nowMs ? due : nowMs + RETRY_MS, tz, sleepStartMin, sleepEndMin);
        return keepAlive ? Math.min(checkIn, nowMs + KEEP_ALIVE_MS) : checkIn;
    }

    /** 12-hour h:mm AM/PM, e.g. 12:05 AM, 6:40 PM. */
    static String clock(int minuteOfDay) {
        int hour = minuteOfDay / 60;
        int hour12 = hour % 12 == 0 ? 12 : hour % 12;
        return String.format(Locale.ROOT, "%d:%02d %s", hour12, minuteOfDay % 60, hour < 12 ? "AM" : "PM");
    }

    /** The clock time, after the day if that isn't today: a weekday within a week, otherwise the date. */
    static String when(long atMs, long nowMs, TimeZone tz) {
        String clock = clock(CheckInPlanner.minuteOfDay(atMs, tz));
        if (FirestoreJson.dateKey(atMs, tz).equals(FirestoreJson.dateKey(nowMs, tz))) return clock;
        SimpleDateFormat day = new SimpleDateFormat(Math.abs(atMs - nowMs) < WEEK_MS ? "EEE" : "MMM d", Locale.ENGLISH);
        day.setTimeZone(tz);
        return day.format(new Date(atMs)) + " " + clock;
    }

    /** What Settings shows of the last background run. */
    static String wakeLine(String source, String when, String result) {
        return source + " " + when + ": " + result;
    }

    /** A worker run that did nothing must not hide the evidence that the alarm was delivered. */
    static boolean keepsLastWake(String source, String result, String lastSource) {
        return WAKE_WORKER.equals(source) && WAKE_ALARM.equals(lastSource)
            && (Outcome.NOT_DUE.name().equals(result) || Outcome.SLEEPING.name().equals(result));
    }

    /** Whether a failed restart may fall back to putting a visible window on screen. */
    static boolean standInAllowed(boolean inCall, boolean asleep) {
        return !inCall && !asleep;
    }

    /** A removed bubble stays removed: this is false until the caller clears the removed flag. */
    public static boolean shouldStartBubble(boolean enabled, boolean signedIn,
                                            boolean overlayGranted, boolean removed) {
        return enabled && signedIn && overlayGranted && !removed;
    }
}
