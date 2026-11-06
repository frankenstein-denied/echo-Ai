package com.echo.app.floating;

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

    private static final long MINUTE_MS = 60_000L;
    private static final int DAY_MINUTES = 24 * 60;
    /** A check-in that is due but had to wait. Keeps a waiting alarm from firing again at once. */
    private static final long RETRY_MS = 5 * MINUTE_MS;

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
