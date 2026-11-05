package com.echo.app.floating;

/** Process-wide flags shared between the floating services and the bridge plugin. */
public final class FloatState {
    public static volatile boolean callRunning = false;
    public static volatile boolean appCallActive = false;
    /** The call has ended but its hidden page is still saving. callRunning stays true until it is gone. */
    public static volatile boolean callFinishing = false;

    private FloatState() {}
}
