package com.echo.app.floating;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.provider.Settings;
import android.util.Log;
import android.view.View;
import android.widget.RemoteViews;
import androidx.core.app.NotificationChannelCompat;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import com.echo.app.MainActivity;
import com.echo.app.R;
import com.echo.app.echo.DeepLinks;
import java.util.List;

/**
 * The check-in notification, for when no bubble can show the message, with the check-in's one-tap answers as
 * buttons. One id, so a new one replaces the last (and its unanswered question) and buzzes again.
 */
public final class CheckInNotifier {
    private static final String TAG = "CheckInTiming";
    /** A channel keeps its first sound for good, so the warm chime needs a new id; the old channel is removed. */
    static final String CHANNEL_ID = "echo_checkins_chime";
    static final String OLD_CHANNEL_ID = "echo_checkins";
    private static final int NOTIFICATION_ID = 4204;
    /** Request codes for the answer buttons, one per slot; a newer check-in's buttons replace these. */
    private static final int REQUEST_ANSWER = 4410;
    private static final int REQUEST_RETRY = 4420;
    private static final long SAVED_SHOWN_MS = 5_000L;

    private static final int[] ROW_A = {R.id.checkin_a1, R.id.checkin_a2, R.id.checkin_a3, R.id.checkin_a4, R.id.checkin_a5};
    private static final int[] ROW_B = {R.id.checkin_b1, R.id.checkin_b2};

    private CheckInNotifier() {}

    /**
     * How loud the chime channel starts: heads-up on a fresh install, but never louder than the user had set the
     * old double-buzz channel (turned off stays off, silent stays silent).
     */
    static int chimeImportance(Integer oldImportance) {
        if (oldImportance == null) return NotificationManagerCompat.IMPORTANCE_HIGH;
        return Math.min(oldImportance, NotificationManagerCompat.IMPORTANCE_HIGH);
    }

    /**
     * How many answers go on the first row of buttons: all of them when they are faces or there are at most
     * three, otherwise the first half (rounded up), so word buttons stay wide enough to read.
     */
    static int firstRowCount(List<CheckInAnswer.Option> options) {
        int n = options.size();
        if (n <= 3 || allFaces(options)) return n;
        return (n + 1) / 2;
    }

    private static boolean allFaces(List<CheckInAnswer.Option> options) {
        for (CheckInAnswer.Option o : options) {
            if (!CheckInAnswer.isFace(o)) return false;
        }
        return true;
    }

    /** Any thread. A failure here must not stop the check-in reaching the chat. */
    static void post(Context ctx, CheckInPlanner.Plan plan, String checkInId, long askedAtMs) {
        try {
            NotificationManagerCompat nm = channel(ctx);
            NotificationCompat.Builder b = base(ctx)
                .setContentText(plan.shortText)
                .setCategory(NotificationCompat.CATEGORY_MESSAGE)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setSound(EchoBuzz.soundUri(ctx)) // Android 7: there are no channels
                .setVibrate(EchoBuzz.VIBRATION)
                .setNumber(1);
            RemoteViews answers = checkInIdUsable(checkInId) ? answersView(ctx, plan, checkInId, askedAtMs) : null;
            if (answers != null) {
                b.setStyle(new NotificationCompat.DecoratedCustomViewStyle())
                    .setCustomBigContentView(answers)
                    .setCustomHeadsUpContentView(answersView(ctx, plan, checkInId, askedAtMs));
            } else {
                b.setStyle(new NotificationCompat.BigTextStyle().bigText(plan.fullText));
            }
            nm.notify(NOTIFICATION_ID, b.build());
        } catch (RuntimeException e) { // includes a missing notification permission
            Log.w(TAG, "could not post the check-in", e);
        }
    }

    /** Any thread. A quiet "Saved" that goes away by itself. */
    static void showSaved(Context ctx, String line) {
        try {
            NotificationManagerCompat nm = channel(ctx);
            nm.notify(NOTIFICATION_ID, base(ctx)
                .setContentText("✓ " + line)
                .setSilent(true)
                .setOnlyAlertOnce(true)
                .setTimeoutAfter(SAVED_SHOWN_MS)
                .build());
        } catch (RuntimeException e) {
            Log.w(TAG, "could not show the saved line", e);
        }
    }

    /**
     * Any thread. The save failed (no signal, an expired session): a tap opens Echo, and Try again sends the
     * same answer, which can only land once.
     */
    static void showFailed(Context ctx, Intent retryAnswer) {
        try {
            NotificationManagerCompat nm = channel(ctx);
            PendingIntent retry = PendingIntent.getBroadcast(ctx, REQUEST_RETRY, retryAnswer,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
            Intent open = new Intent(ctx, MainActivity.class)
                .putExtra(DeepLinks.EXTRA_PATH, DeepLinks.DIARY)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            nm.notify(NOTIFICATION_ID, base(ctx)
                .setContentText(ctx.getString(R.string.check_in_save_failed))
                .setContentIntent(PendingIntent.getActivity(ctx, NOTIFICATION_ID, open,
                    PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT))
                .addAction(0, ctx.getString(R.string.check_in_try_again), retry)
                .setSilent(true)
                .build());
        } catch (RuntimeException e) {
            Log.w(TAG, "could not show the failed save", e);
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

    private static NotificationManagerCompat channel(Context ctx) {
        NotificationManagerCompat nm = NotificationManagerCompat.from(ctx);
        // Carry the user's choice over from the double-buzz channel, once; after that it is gone (null).
        NotificationChannelCompat old = nm.getNotificationChannelCompat(OLD_CHANNEL_ID);
        int importance = chimeImportance(old == null ? null : old.getImportance());
        if (old != null) nm.deleteNotificationChannel(OLD_CHANNEL_ID);
        nm.createNotificationChannel(
            new NotificationChannelCompat.Builder(CHANNEL_ID, importance)
                .setName(ctx.getString(R.string.check_in_channel_name))
                .setDescription(ctx.getString(R.string.check_in_channel_desc))
                .setSound(EchoBuzz.soundUri(ctx), EchoBuzz.audioAttributes())
                .setVibrationEnabled(true)
                .setVibrationPattern(EchoBuzz.VIBRATION)
                .build());
        return nm;
    }

    private static NotificationCompat.Builder base(Context ctx) {
        return new NotificationCompat.Builder(ctx, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_echo)
            .setContentTitle(ctx.getString(R.string.float_message_name))
            .setContentIntent(tapIntent(ctx))
            .setAutoCancel(true);
    }

    private static boolean checkInIdUsable(String checkInId) {
        return CheckInAnswer.answerId(checkInId) != null;
    }

    /** The question and a button per answer: saves go to the receiver, answers in words open the chat. */
    private static RemoteViews answersView(Context ctx, CheckInPlanner.Plan plan, String checkInId, long askedAtMs) {
        List<CheckInAnswer.Option> options = CheckInAnswer.options(plan.topic);
        if (options.isEmpty()) return null;
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.notif_checkin);
        v.setTextViewText(R.id.checkin_text, plan.fullText);
        int first = firstRowCount(options);
        v.setViewVisibility(R.id.checkin_row_b, options.size() > first ? View.VISIBLE : View.GONE);
        for (int i = 0; i < options.size(); i++) {
            int slot = i < first ? ROW_A[i] : ROW_B[i - first];
            CheckInAnswer.Option o = options.get(i);
            v.setTextViewText(slot, o.label);
            v.setViewVisibility(slot, View.VISIBLE);
            v.setOnClickPendingIntent(slot, answerIntent(ctx, plan, checkInId, askedAtMs, o, REQUEST_ANSWER + i));
        }
        return v;
    }

    private static PendingIntent answerIntent(Context ctx, CheckInPlanner.Plan plan, String checkInId, long askedAtMs,
                                              CheckInAnswer.Option o, int requestCode) {
        int flags = PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT;
        if (o.kind == CheckInAnswer.Kind.OPEN_CHAT) {
            // An activity, not a broadcast: Android won't let a receiver behind a notification open anything.
            return PendingIntent.getActivity(ctx, requestCode, FloatLaunchActivity.chatIntent(ctx, checkInId), flags);
        }
        return PendingIntent.getBroadcast(ctx, requestCode, CheckInAnswerReceiver.intent(ctx, checkInId, plan.topic,
            o.code, plan.reminderId, plan.reminderDueAtMs, askedAtMs, true), flags);
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
