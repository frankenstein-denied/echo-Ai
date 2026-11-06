package com.echo.app.floating;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.util.DisplayMetrics;
import android.util.Log;
import android.view.Gravity;
import android.view.LayoutInflater;
import android.view.View;
import android.view.WindowManager;
import com.echo.app.R;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Brings the bubble up with nothing of Echo's on screen. An exact alarm or a boot may start a foreground
 * service directly. If Android refuses, Android 15 still allows it once an overlay window of ours is visible,
 * so a stand-in bubble goes up first and comes down when the real head is there.
 */
final class BubbleBringUp {
    private static final String TAG = "Chathead";
    private static final long START_WAIT_MS = 3_000L;
    private static final long VISIBLE_WAIT_MS = 1_000L;
    private static final long SURFACE_SETTLE_MS = 200L; // drawn is not yet shown: the system counts the surface
    private static final long POLL_MS = 50L;

    private static final AtomicBoolean BUSY = new AtomicBoolean(false);

    private BubbleBringUp() {}

    /** Off the main thread only: blocks for a few seconds at most. True once the bubble's engine is running. */
    static boolean run(Context ctx) {
        Context app = ctx.getApplicationContext();
        if (ChatheadService.isShowing()) return FloatState.bubbleRunning;
        if (!BUSY.compareAndSet(false, true)) return false;
        try {
            String direct = startDirectly(app);
            if (direct == null) return true;
            Log.w(TAG, "direct start failed: " + direct);
            if (!CheckInEngine.standInAllowed(app)) {
                if (!FloatState.bubbleRunning) ChatheadService.recordError(app, direct);
                return FloatState.bubbleRunning;
            }
            String overlay = startBehindOverlay(app);
            if (overlay == null) return true;
            Log.w(TAG, "overlay start failed: " + overlay);
            if (!FloatState.bubbleRunning) ChatheadService.recordError(app, direct + "; " + overlay);
            return FloatState.bubbleRunning;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return FloatState.bubbleRunning;
        } finally {
            BUSY.set(false);
        }
    }

    /** Null on success, otherwise the reason. */
    private static String startDirectly(Context app) throws InterruptedException {
        ChatheadService.lastFailure = null;
        try {
            ChatheadService.launch(app);
        } catch (RuntimeException e) {
            return "start refused: " + e.getClass().getSimpleName();
        }
        return awaitBubble();
    }

    private static String startBehindOverlay(Context app) throws InterruptedException {
        if (!Settings.canDrawOverlays(app)) return "overlay not allowed";
        Handler main = new Handler(Looper.getMainLooper());
        AtomicReference<View> bridge = new AtomicReference<>();
        AtomicReference<String> refused = new AtomicReference<>();
        CountDownLatch added = new CountDownLatch(1);
        main.post(() -> {
            try {
                bridge.set(addBridge(app));
            } catch (RuntimeException e) {
                refused.set("overlay refused: " + e.getClass().getSimpleName());
            } finally {
                added.countDown();
            }
        });
        try {
            if (!added.await(VISIBLE_WAIT_MS, TimeUnit.MILLISECONDS)) return "overlay timed out";
            View view = bridge.get();
            if (view == null) return refused.get();
            if (!awaitVisible(view)) return "overlay not visible";
            Thread.sleep(SURFACE_SETTLE_MS);
            ChatheadService.lastFailure = null;
            try {
                ChatheadService.launch(app);
            } catch (RuntimeException e) {
                return "start behind overlay refused: " + e.getClass().getSimpleName();
            }
            return awaitBubble();
        } finally {
            main.post(() -> removeBridge(app, bridge.get())); // after the add above, even if that ran late
        }
    }

    private static View addBridge(Context app) {
        WindowManager windows = (WindowManager) app.getSystemService(Context.WINDOW_SERVICE);
        DisplayMetrics metrics = app.getResources().getDisplayMetrics();
        int size = Math.round(ChatheadService.HEAD_DP * metrics.density);
        View view = LayoutInflater.from(app).inflate(R.layout.float_head, null);
        WindowManager.LayoutParams p = ChatheadService.overlayParams(size, size,
            ChatheadGeometry.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE);
        p.alpha = ChatheadService.DIM_WINDOW_ALPHA; // any more opaque and Android 12+ swallows touches below
        p.gravity = Gravity.TOP | Gravity.END;
        p.y = metrics.heightPixels / 3; // where the real head appears
        windows.addView(view, p);
        return view;
    }

    private static void removeBridge(Context app, View view) {
        if (view == null) return;
        try {
            ((WindowManager) app.getSystemService(Context.WINDOW_SERVICE)).removeViewImmediate(view);
        } catch (RuntimeException e) {
            Log.w(TAG, "could not remove the stand-in bubble", e);
        }
    }

    /** With the screen off the window never becomes visible, and this runs out. */
    private static boolean awaitVisible(View view) throws InterruptedException {
        long deadline = System.currentTimeMillis() + VISIBLE_WAIT_MS;
        while (System.currentTimeMillis() < deadline) {
            if (view.getWindowVisibility() == View.VISIBLE && view.isShown() && view.getWidth() > 0) return true;
            Thread.sleep(POLL_MS);
        }
        return false;
    }

    /** Null when the engine is running, otherwise why it is not. Leaves early if the service reports a failure. */
    private static String awaitBubble() throws InterruptedException {
        long deadline = System.currentTimeMillis() + START_WAIT_MS;
        while (System.currentTimeMillis() < deadline) {
            if (FloatState.bubbleRunning) return null;
            String failure = ChatheadService.lastFailure;
            if (failure != null) return failure;
            Thread.sleep(POLL_MS);
        }
        return FloatState.bubbleRunning ? null : "no answer from the service";
    }
}
