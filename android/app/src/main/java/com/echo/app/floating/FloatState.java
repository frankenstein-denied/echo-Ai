package com.echo.app.floating;

/** Process-wide flags shared between the floating services and the bridge plugin. */
public final class FloatState {
    public static volatile boolean callRunning = false;
    public static volatile boolean appCallActive = false;
    /** The call has ended but its hidden page is still saving. callRunning stays true until it is gone. */
    public static volatile boolean callFinishing = false;
    /** The full Echo app is on screen. Set by MainActivity. */
    public static volatile boolean appInForeground = false;
    /** The bubble is up with a running CheckInEngine. Set by the engine. */
    public static volatile boolean bubbleRunning = false;
    /** The chat panel is open. Set by ChatheadService, read off the main thread by background firing. */
    public static volatile boolean panelOpen = false;

    private FloatState() {}
}
