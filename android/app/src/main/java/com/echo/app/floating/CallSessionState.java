package com.echo.app.floating;

/**
 * Pure state of one floating call: IDLE, then CONNECTING, CONNECTED, FAILED (message showing) and
 * DONE. Failure and DONE are final, so late page events cannot revive a call. One instance serves
 * one call; a new call uses a new instance.
 */
public final class CallSessionState {
    public static final long CONNECT_TIMEOUT_MS = 20000;
    public static final long FAILURE_SHOW_MS = 3000;

    private static final String CONNECT_FAILED = "Couldn't connect";

    private enum Stage { IDLE, CONNECTING, CONNECTED, FAILED, DONE }

    private Stage stage = Stage.IDLE;
    private long startedAt;
    private long failedAt;
    private String pill = "";
    private boolean connected;

    /** False if this state already ran a call: there is never a second one. */
    public boolean start(long nowMs) {
        if (stage != Stage.IDLE) return false;
        stage = Stage.CONNECTING;
        startedAt = nowMs;
        pill = CallPhaseLabel.of("connecting");
        return true;
    }

    public void onPhase(String phase, long nowMs) {
        if (stage != Stage.CONNECTING && stage != Stage.CONNECTED) return;
        String label = CallPhaseLabel.of(phase);
        if (label.isEmpty()) return; // idle comes before dialling and just before onEnded: keep the text
        pill = label;
        // Only a live phase counts as connected: a page stuck on "connecting" must still time out.
        if (!"connecting".equals(phase)) {
            stage = Stage.CONNECTED;
            connected = true;
        }
    }

    public void onEnded(String reason, long nowMs) {
        if (stage != Stage.CONNECTING && stage != Stage.CONNECTED) return;
        if ("user".equals(reason)) {
            stage = Stage.DONE;
        } else if ("quota".equals(reason)) {
            fail("Echo's voice reached today's limit", nowMs);
        } else if ("dropped".equals(reason)) {
            fail("The call dropped", nowMs);
        } else {
            fail(CONNECT_FAILED, nowMs);
        }
    }

    public void requestExit(long nowMs) {
        if (stage != Stage.IDLE) stage = Stage.DONE;
    }

    public void tick(long nowMs) {
        if (stage == Stage.CONNECTING && nowMs - startedAt >= CONNECT_TIMEOUT_MS) {
            fail(CONNECT_FAILED, nowMs);
        } else if (stage == Stage.FAILED && nowMs - failedAt >= FAILURE_SHOW_MS) {
            stage = Stage.DONE;
        }
    }

    public String pillText() {
        return pill;
    }

    /** The failure message is showing; the page may need telling to stop trying. */
    public boolean hasFailed() {
        return stage == Stage.FAILED;
    }

    /** The call went live at some point, so the page may hold a last turn still being saved. */
    public boolean hasConnected() {
        return connected;
    }

    public boolean shouldTearDown() {
        return stage == Stage.DONE;
    }

    /** True from start until teardown is due, including while a failure message shows. */
    public boolean isRunning() {
        return stage != Stage.IDLE && stage != Stage.DONE;
    }

    private void fail(String message, long nowMs) {
        stage = Stage.FAILED;
        failedAt = nowMs;
        pill = message;
    }
}
