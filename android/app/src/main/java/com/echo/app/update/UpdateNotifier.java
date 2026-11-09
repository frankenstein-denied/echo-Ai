package com.echo.app.update;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.util.Log;
import androidx.core.app.NotificationChannelCompat;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import com.echo.app.MainActivity;
import com.echo.app.R;

/**
 * Tells the user about a new version while the app is closed. UpdateCheckWorker calls this; a tap opens
 * Echo, which starts the download, because Android blocks starting the installer from the background.
 */
public final class UpdateNotifier {
    private static final String TAG = "EchoUpdates";
    public static final String EXTRA_UPDATE = "echo_update";
    static final String CHANNEL_ID = "echo_updates";
    /** Not 4201: that is the pinned notification (NotificationRenderer.NOTIFICATION_ID). */
    static final int NOTIFICATION_ID = 4205;
    private static final int REQUEST_CODE = 4201;
    /** How often UpdateCheckWorker runs. */
    static final long CHECK_EVERY_MS = 6 * 60 * 60_000L;
    /** Shorter than CHECK_EVERY_MS, so a worker run that WorkManager starts a little early is never skipped. */
    static final long MIN_GAP_MS = 5 * 60 * 60_000L;
    private static final int MAX_LINES = 3;

    // Shares AppUpdater's prefs file; the keys are separate.
    private static final String PREFS = "echo_updates";
    private static final String PREF_LAST_CHECK = "lastCheckMs";
    private static final String PREF_NOTIFIED = "notifiedCode";

    private UpdateNotifier() {}

    /** Never checked, 5 hours since the last check, or the clock went backwards. */
    static boolean checkDue(long nowMs, long lastCheckMs) {
        return lastCheckMs <= 0 || nowMs < lastCheckMs || nowMs - lastCheckMs >= MIN_GAP_MS;
    }

    /** A newer version the user has not been told about yet. */
    static boolean shouldNotify(int installedCode, int latestCode, int notifiedCode) {
        return latestCode > installedCode && latestCode != notifiedCode;
    }

    /** The version we told the user about is now installed. */
    static boolean shouldCancel(int installedCode, int notifiedCode) {
        return notifiedCode > 0 && installedCode >= notifiedCode;
    }

    /** Act on a notification tap only when it is fresh: not a relaunch from Recents, not a restored Activity. */
    public static boolean shouldStartUpdate(boolean hasExtra, int intentFlags, boolean restored) {
        return hasExtra && !restored && (intentFlags & Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) == 0;
    }

    /** Any thread, no network: clears the notification once the version it announced is installed. */
    static void clearIfInstalled(Context ctx) {
        SharedPreferences prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (!shouldCancel(AppUpdater.installedVersionCode(ctx), prefs.getInt(PREF_NOTIFIED, 0))) return;
        NotificationManagerCompat.from(ctx).cancel(NOTIFICATION_ID);
        prefs.edit().putInt(PREF_NOTIFIED, 0).apply();
    }

    /** Blocking (network): call from a worker thread. Does nothing without notification permission. */
    public static void maybeNotify(Context ctx) {
        NotificationManagerCompat nm = NotificationManagerCompat.from(ctx);
        if (!nm.areNotificationsEnabled()) return;
        clearIfInstalled(ctx);
        SharedPreferences prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        int installed = AppUpdater.installedVersionCode(ctx);
        int notified = prefs.getInt(PREF_NOTIFIED, 0);

        long now = System.currentTimeMillis();
        if (!checkDue(now, prefs.getLong(PREF_LAST_CHECK, 0))) return;
        String json = AppUpdater.fetch(AppUpdater.VERSION_URL);
        if (json == null) return; // offline or GitHub down: try again on the next run
        prefs.edit().putLong(PREF_LAST_CHECK, now).apply();
        UpdateInfo info = UpdateInfo.parse(json);
        if (info == null || !shouldNotify(installed, info.versionCode, notified)) return;
        try {
            post(ctx, nm, info);
            prefs.edit().putInt(PREF_NOTIFIED, info.versionCode).apply();
        } catch (RuntimeException e) { // includes a permission revoked a moment ago
            Log.w(TAG, "could not post the update notification", e);
        }
    }

    private static void post(Context ctx, NotificationManagerCompat nm, UpdateInfo info) {
        nm.createNotificationChannel(
            new NotificationChannelCompat.Builder(CHANNEL_ID, NotificationManagerCompat.IMPORTANCE_DEFAULT)
                .setName(ctx.getString(R.string.update_channel_name))
                .setDescription(ctx.getString(R.string.update_channel_desc))
                .build());
        String text = !info.changes.isEmpty() ? info.changes.get(0)
            : !info.notes.trim().isEmpty() ? info.notes.trim()
            : ctx.getString(R.string.update_subtitle);
        StringBuilder big = new StringBuilder();
        for (int i = 0; i < info.changes.size() && i < MAX_LINES; i++) {
            if (big.length() > 0) big.append('\n');
            big.append("• ").append(info.changes.get(i));
        }
        PendingIntent open = openToUpdate(ctx);
        nm.notify(NOTIFICATION_ID, new NotificationCompat.Builder(ctx, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_echo)
            .setContentTitle(ctx.getString(R.string.update_notif_title, info.versionName))
            .setContentText(text)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(big.length() > 0 ? big : text))
            .setContentIntent(open)
            .addAction(R.drawable.ic_stat_echo, ctx.getString(R.string.update_now), open)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .build());
    }

    private static PendingIntent openToUpdate(Context ctx) {
        Intent i = new Intent(ctx, MainActivity.class)
            .putExtra(EXTRA_UPDATE, true)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(ctx, REQUEST_CODE, i,
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }
}
