package com.echo.app.echo;

import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Handles taps on the pinned notification: tab switches (no network) and Done / Snooze. */
public class ActionReceiver extends BroadcastReceiver {
    public static final String ACTION_TAB_REMINDERS = "com.echo.app.action.TAB_REMINDERS";
    public static final String ACTION_TAB_GOALS = "com.echo.app.action.TAB_GOALS";
    public static final String ACTION_DONE = "com.echo.app.action.DONE";
    public static final String ACTION_SNOOZE = "com.echo.app.action.SNOOZE";
    /** Fired by the notification's delete intent, i.e. only when the user dismisses it. */
    public static final String ACTION_DISMISSED = "com.echo.app.action.DISMISSED";
    private static final String EXTRA_ID = "id";

    private static final ExecutorService NETWORK = Executors.newSingleThreadExecutor();

    /** Explicit, immutable broadcast to this receiver. {@code requestCode} must be unique per row/action. */
    static PendingIntent pending(Context ctx, String action, String id, int requestCode) {
        Intent i = new Intent(ctx, ActionReceiver.class).setAction(action);
        if (id != null) i.putExtra(EXTRA_ID, id);
        return PendingIntent.getBroadcast(ctx, requestCode, i,
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        final Context ctx = context.getApplicationContext();
        String action = intent == null ? null : intent.getAction();
        if (action == null) return;
        switch (action) {
            case ACTION_TAB_REMINDERS:
                switchTab(ctx, SessionStore.TAB_REMINDERS);
                break;
            case ACTION_TAB_GOALS:
                switchTab(ctx, SessionStore.TAB_GOALS);
                break;
            case ACTION_DISMISSED:
                PinnedController.repostIfPinned(ctx);
                break;
            case ACTION_DONE:
            case ACTION_SNOOZE:
                runReminderAction(ctx, action, intent.getStringExtra(EXTRA_ID));
                break;
            default:
                break;
        }
    }

    private static void switchTab(Context ctx, String tab) {
        try {
            SessionStore.get(ctx).setTab(tab);
        } catch (IllegalStateException ignored) {
            return;
        }
        if (!EchoNotificationService.renderFromCache(ctx)) PinnedController.refresh(ctx);
    }

    private void runReminderAction(final Context ctx, final String action, final String id) {
        if (id == null || id.isEmpty()) return;
        final PendingResult result = goAsync();
        NETWORK.execute(() -> {
            try {
                EchoApi api = new EchoApi(ctx);
                boolean ok = ACTION_DONE.equals(action) ? api.markDone(id) : api.snooze(id);
                if (ok) {
                    PinnedController.refresh(ctx);
                } else if (!EchoNotificationService.renderFromCache(ctx)) {
                    // Failure: keep the current state on screen (re-render, no reload).
                    PinnedController.refresh(ctx);
                }
            } catch (RuntimeException ignored) {
                // Never crash the process from a notification tap.
            } finally {
                result.finish();
            }
        });
    }
}
