package com.echo.app.echo;

import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import androidx.core.content.ContextCompat;

/** Entry point for the pinned notification: starts, refreshes and stops EchoNotificationService. */
public final class PinnedController {
    private PinnedController() {}

    /**
     * Saves the pref; pinned starts the service (signed-out content if no session), unpinned stops it.
     * Unpinning leaves the worker running while check-ins are on.
     */
    public static void setPinned(Context ctx, boolean pinned) {
        SessionStore.get(ctx).setPinned(pinned);
        if (pinned) {
            RefreshWorker.schedule(ctx);
            start(ctx);
        } else {
            RefreshWorker.sync(ctx);
            stopService(ctx);
        }
    }

    /** Asks the service to reload its data, if pinned and signed in. Starts it if it was killed. */
    public static void refresh(Context ctx) {
        SessionStore store;
        try {
            store = SessionStore.get(ctx);
        } catch (IllegalStateException e) {
            return;
        }
        if (!store.isPinned() || !store.hasSession()) return;
        RefreshWorker.schedule(ctx); // idempotent (KEEP); restores the safety net after sign-in
        start(ctx);
    }

    /**
     * Runs Done / Snooze on the service's background executor, then refreshes. Returns immediately.
     * If the service is not running it is started (start failures are swallowed, as for refresh).
     */
    static void runReminderAction(Context ctx, String action, String id) {
        if (id == null || id.isEmpty()) return;
        Context app = ctx.getApplicationContext();
        Intent i = new Intent(app, EchoNotificationService.class)
            .putExtra(EchoNotificationService.EXTRA_CMD, action)
            .putExtra(ActionReceiver.EXTRA_ID, id);
        startWith(app, i);
    }

    /**
     * Stops the service and drops cached data (used on sign-out). Keeps the pinned pref. Leaves the worker
     * running while check-ins are on: a sign-out cancels it once the session is gone.
     */
    public static void stop(Context ctx) {
        EchoNotificationService.clearCache();
        RefreshWorker.sync(ctx);
        stopService(ctx);
    }

    /** Brings the notification back after the user swiped it away (Android 14+ allows that). */
    static void repostIfPinned(Context ctx) {
        try {
            if (!SessionStore.get(ctx).isPinned()) return;
        } catch (IllegalStateException e) {
            return;
        }
        if (!EchoNotificationService.renderFromCache(ctx)) start(ctx);
    }

    private static void start(Context ctx) {
        Context app = ctx.getApplicationContext();
        startWith(app, new Intent(app, EchoNotificationService.class));
    }

    private static void startWith(Context app, Intent i) {
        try {
            if (EchoNotificationService.isRunning()) {
                // Already foreground: a plain start command is allowed and triggers a reload.
                app.startService(i);
            } else {
                ContextCompat.startForegroundService(app, i);
            }
        } catch (RuntimeException e) {
            // ForegroundServiceStartNotAllowedException / IllegalStateException when started from
            // the background on Android 12+, or SecurityException: skip until the next chance.
        }
    }

    private static void stopService(Context ctx) {
        Context app = ctx.getApplicationContext();
        app.stopService(new Intent(app, EchoNotificationService.class));
        NotificationManager nm = (NotificationManager) app.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.cancel(NotificationRenderer.NOTIFICATION_ID);
    }
}
