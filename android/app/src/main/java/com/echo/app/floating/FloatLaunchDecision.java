package com.echo.app.floating;

/** Pure decision for a Talk / Type tap on the pinned notification. */
public final class FloatLaunchDecision {
    public enum Outcome {
        OPEN_APP,
        OPEN_OVERLAY_SETTINGS,
        REQUEST_MIC,
        START_CALL,
        SHOW_CHATHEAD,
        ALREADY_RUNNING,
        BLOCKED_BY_APP_CALL
    }

    private FloatLaunchDecision() {}

    public static Outcome decide(String action, boolean signedIn, boolean overlayGranted,
                                 boolean micGranted, boolean callRunning, boolean appCallActive) {
        if (!signedIn) return Outcome.OPEN_APP;
        if (!overlayGranted) return Outcome.OPEN_OVERLAY_SETTINGS;
        boolean talk = FloatLaunchActivity.ACTION_TALK.equals(action);
        if (!talk) return Outcome.SHOW_CHATHEAD;
        if (callRunning) return Outcome.ALREADY_RUNNING;
        if (appCallActive) return Outcome.BLOCKED_BY_APP_CALL;
        if (!micGranted) return Outcome.REQUEST_MIC;
        return Outcome.START_CALL;
    }
}
