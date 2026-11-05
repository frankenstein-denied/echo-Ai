package com.echo.app.floating;

/** Process-wide flags shared between the floating services and the bridge plugin. */
public final class FloatState {
    public static volatile boolean callRunning = false;
    public static volatile boolean appCallActive = false;

    private FloatState() {}
}
