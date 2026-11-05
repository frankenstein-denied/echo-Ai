package com.echo.app.echo;

import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Handles taps on the pinned notification: tab switches (no network) and Done / Snooze. */
public class ActionReceiver extends BroadcastReceiver {
    public static final String ACTION_TAB_REMINDERS = "com.echo.app.action.TAB_REMINDERS";
    public static final String ACTION_TAB_GOALS = "com.echo.app.action.TAB_GOALS";
    public static final String ACTION_DONE = "com.echo.app.action.DONE";
    public static final String ACTION_SNOOZE = "com.echo.app.action.SNOOZE";
    /** Fired by the notification's delete intent, i.e. only when the user dismisses it. */
    public static final String ACTION_DISMISSED = "com.echo.app.action.DISMISSED";
    static final String EXTRA_ID = "id";

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
                // No network here: hand off to the foreground service (no broadcast time limit).
                PinnedController.runReminderAction(ctx, action, intent.getStringExtra(EXTRA_ID));
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
}
