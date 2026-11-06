package com.echo.app.floating;

/** Pure decisions for chathead check-ins: when one fires, and how it reaches the user. */
public final class CheckInRules {
    public enum Outcome {
        OFF,
        SLEEPING,
        NOT_DUE,
        WAIT,
        POPUP,
        CHAT_ONLY,
        QUIET
    }

    /** Everything {@link #decide} looks at, read fresh by the caller for each decision. */
    public static final class State {
        public boolean enabled;
        public boolean signedIn;
        public boolean bubbleRunning;
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
        public int quietUnread;
    }

    private static final long MINUTE_MS = 60_000L;

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
        if (s.bubbleRunning) {
            if (s.inCall || s.appInForeground || !s.screenOn) return Outcome.WAIT;
            return s.panelOpen ? Outcome.CHAT_ONLY : Outcome.POPUP;
        }
        return s.quietUnread >= 1 ? Outcome.WAIT : Outcome.QUIET;
    }

    /** A removed bubble stays removed: this is false until the caller clears the removed flag. */
    public static boolean shouldStartBubble(boolean enabled, boolean signedIn,
                                            boolean overlayGranted, boolean removed) {
        return enabled && signedIn && overlayGranted && !removed;
    }
}
