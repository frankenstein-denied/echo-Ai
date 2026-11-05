package com.echo.app.floating;

/** Pill text for a call phase reported by the embedded page. */
public final class CallPhaseLabel {
    private CallPhaseLabel() {}

    /** "" for idle and unknown phases, which have nothing to show. */
    public static String of(String phase) {
        if (phase == null) return "";
        switch (phase) {
            case "connecting": return "Connecting…";
            case "listening": return "Listening";
            case "thinking": return "Thinking";
            case "speaking": return "Echo is speaking";
            default: return "";
        }
    }
}
