package com.echo.app.floating;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.provider.Settings;
import android.util.Log;
import androidx.core.app.NotificationChannelCompat;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import com.echo.app.MainActivity;
import com.echo.app.R;
import com.echo.app.echo.DeepLinks;

/** The check-in notification, for when no bubble can show the message. One id, so a new one replaces the last and buzzes again. */
public final class CheckInNotifier {
    private static final String TAG = "CheckInTiming";
    private static final String CHANNEL_ID = "echo_checkins";
    private static final int NOTIFICATION_ID = 4204;

    private CheckInNotifier() {}

    /** Any thread. A failure here must not stop the check-in reaching the chat. */
    static void post(Context ctx, CheckInPlanner.Plan plan, int unread) {
        try {
            NotificationManagerCompat nm = NotificationManagerCompat.from(ctx);
            nm.createNotificationChannel(
                new NotificationChannelCompat.Builder(CHANNEL_ID, NotificationManagerCompat.IMPORTANCE_HIGH)
                    .setName(ctx.getString(R.string.check_in_channel_name))
                    .setDescription(ctx.getString(R.string.check_in_channel_desc))
                    .setSound(EchoBuzz.soundUri(ctx), EchoBuzz.audioAttributes())
                    .setVibrationEnabled(true)
                    .setVibrationPattern(EchoBuzz.VIBRATION)
                    .build());
            nm.notify(NOTIFICATION_ID, new NotificationCompat.Builder(ctx, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_stat_echo)
                .setContentTitle(ctx.getString(R.string.float_message_name))
                .setContentText(plan.shortText)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(plan.fullText))
                .setNumber(unread)
                .setContentIntent(tapIntent(ctx))
                .setAutoCancel(true)
                .setCategory(NotificationCompat.CATEGORY_MESSAGE)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setSound(EchoBuzz.soundUri(ctx)) // Android 7: there are no channels
                .setVibrate(EchoBuzz.VIBRATION)
                .build());
        } catch (RuntimeException e) { // includes a missing notification permission
            Log.w(TAG, "could not post the check-in", e);
        }
    }

    /** Any thread. */
    public static void cancel(Context ctx) {
        try {
            NotificationManagerCompat.from(ctx).cancel(NOTIFICATION_ID);
        } catch (RuntimeException e) {
            Log.w(TAG, "could not cancel the check-in", e);
        }
    }

    /** Type brings a bubble back, because a tap is a visible moment. Without the overlay, the Diary in the app. */
    private static PendingIntent tapIntent(Context ctx) {
        Intent i;
        if (Settings.canDrawOverlays(ctx)) {
            i = new Intent(ctx, FloatLaunchActivity.class)
                .putExtra(FloatLaunchActivity.EXTRA_ACTION, FloatLaunchActivity.ACTION_TYPE)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_NO_ANIMATION);
        } else {
            i = new Intent(ctx, MainActivity.class)
                .putExtra(DeepLinks.EXTRA_PATH, DeepLinks.DIARY)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        }
        return PendingIntent.getActivity(ctx, NOTIFICATION_ID, i,
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }
}
