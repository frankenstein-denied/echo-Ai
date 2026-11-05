package com.echo.app.echo;

import android.app.Notification;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Typeface;
import android.text.SpannableString;
import android.text.Spanned;
import android.text.format.DateFormat;
import android.text.style.StyleSpan;
import android.view.View;
import android.widget.RemoteViews;
import androidx.core.app.NotificationChannelCompat;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import com.echo.app.MainActivity;
import com.echo.app.R;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;

/** Builds the pinned "Echo" notification from already-loaded data. No network, no disk writes. */
public final class NotificationRenderer {
    public static final String CHANNEL_ID = "echo_pinned";
    public static final int NOTIFICATION_ID = 4201;
    public static final int MAX_ROWS = 3;

    // PendingIntent request codes: unique per action and row.
    private static final int RC_OPEN = 1;
    private static final int RC_TALK = 2;
    private static final int RC_TYPE = 3;
    private static final int RC_SIGN_IN = 4;
    private static final int RC_DISMISSED = 5;
    private static final int RC_TAB_REMINDERS = 10;
    private static final int RC_TAB_GOALS = 11;
    private static final int RC_TAB_NOTES = 12;
    private static final int RC_DONE_BASE = 20;
    private static final int RC_SNOOZE_BASE = 30;
    private static final int RC_GOAL_BASE = 40;
    private static final int RC_REMINDER_BASE = 50;
    private static final int RC_NOTE_BASE = 60;

    /** What to show. Lists are null until the first successful load. */
    public static final class State {
        final boolean signedIn;
        final String tab;
        final List<Reminder> reminders;
        final List<Goal> goals;
        final List<Note> notes;
        final boolean loadFailed;

        public State(boolean signedIn, String tab, List<Reminder> reminders, List<Goal> goals, List<Note> notes, boolean loadFailed) {
            this.signedIn = signedIn;
            this.tab = tab;
            this.reminders = reminders;
            this.goals = goals;
            this.notes = notes;
            this.loadFailed = loadFailed;
        }
    }

    private NotificationRenderer() {}

    public static void ensureChannel(Context ctx) {
        NotificationManagerCompat.from(ctx).createNotificationChannel(
            new NotificationChannelCompat.Builder(CHANNEL_ID, NotificationManagerCompat.IMPORTANCE_LOW)
                .setName(ctx.getString(R.string.notif_channel_name))
                .setDescription(ctx.getString(R.string.notif_channel_desc))
                .setShowBadge(false)
                .setSound(null, null)
                .setVibrationEnabled(false)
                .setLightsEnabled(false)
                .build());
    }

    public static Notification build(Context ctx, State s) {
        ensureChannel(ctx);
        String pkg = ctx.getPackageName();
        RemoteViews small = new RemoteViews(pkg, R.layout.notif_pinned_small);
        RemoteViews big = new RemoteViews(pkg, R.layout.notif_pinned);

        if (!s.signedIn) {
            small.setTextViewText(R.id.small_title, ctx.getString(R.string.notif_signed_out));
            small.setViewVisibility(R.id.small_sub, View.GONE);
            big.setViewVisibility(R.id.signed_out, View.VISIBLE);
            big.setViewVisibility(R.id.content, View.GONE);
            big.setOnClickPendingIntent(R.id.signed_out, openApp(ctx, RC_SIGN_IN, null));
        } else {
            renderTabs(ctx, big, s.tab);
            big.removeAllViews(R.id.rows);
            if (SessionStore.TAB_GOALS.equals(s.tab)) renderGoals(ctx, small, big, s);
            else if (SessionStore.TAB_NOTES.equals(s.tab)) renderNotes(ctx, small, big, s);
            else renderReminders(ctx, small, big, s);
            big.setOnClickPendingIntent(R.id.btn_talk, openApp(ctx, RC_TALK, DeepLinks.DIARY));
            big.setOnClickPendingIntent(R.id.btn_type, openApp(ctx, RC_TYPE, DeepLinks.DIARY));
        }

        return new NotificationCompat.Builder(ctx, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_echo)
            .setContentTitle(ctx.getString(R.string.app_name))
            .setCustomContentView(small)
            .setCustomBigContentView(big)
            .setStyle(new NotificationCompat.DecoratedCustomViewStyle())
            .setContentIntent(openApp(ctx, RC_OPEN, null))
            .setDeleteIntent(ActionReceiver.pending(ctx, ActionReceiver.ACTION_DISMISSED, null, RC_DISMISSED))
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setShowWhen(false)
            .setSilent(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_STATUS)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .build();
    }

    private static void renderTabs(Context ctx, RemoteViews big, String tab) {
        styleTab(ctx, big, R.id.tab_reminders, R.string.notif_tab_reminders, SessionStore.TAB_REMINDERS.equals(tab));
        styleTab(ctx, big, R.id.tab_goals, R.string.notif_tab_goals, SessionStore.TAB_GOALS.equals(tab));
        styleTab(ctx, big, R.id.tab_notes, R.string.notif_tab_notes, SessionStore.TAB_NOTES.equals(tab));
        big.setOnClickPendingIntent(R.id.tab_reminders,
            ActionReceiver.pending(ctx, ActionReceiver.ACTION_TAB_REMINDERS, null, RC_TAB_REMINDERS));
        big.setOnClickPendingIntent(R.id.tab_goals,
            ActionReceiver.pending(ctx, ActionReceiver.ACTION_TAB_GOALS, null, RC_TAB_GOALS));
        big.setOnClickPendingIntent(R.id.tab_notes,
            ActionReceiver.pending(ctx, ActionReceiver.ACTION_TAB_NOTES, null, RC_TAB_NOTES));
    }

    private static void styleTab(Context ctx, RemoteViews big, int viewId, int textRes, boolean selected) {
        String label = ctx.getString(textRes);
        CharSequence text = label;
        if (selected) {
            SpannableString bold = new SpannableString(label);
            bold.setSpan(new StyleSpan(Typeface.BOLD), 0, label.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
            text = bold;
        }
        big.setTextViewText(viewId, text);
        big.setInt(viewId, "setBackgroundResource", selected ? R.drawable.notif_tab_selected : 0);
    }

    private static void renderReminders(Context ctx, RemoteViews small, RemoteViews big, State s) {
        List<Reminder> list = s.reminders;
        if (list == null || list.isEmpty()) {
            String msg = emptyText(ctx, s, list == null, R.string.notif_no_reminders);
            showEmpty(ctx, small, big, msg);
            return;
        }
        big.setViewVisibility(R.id.empty, View.GONE);
        long now = System.currentTimeMillis();
        TimeZone tz = TimeZone.getDefault();
        Locale locale = Locale.getDefault();
        boolean use24h = DateFormat.is24HourFormat(ctx);
        for (int i = 0; i < Math.min(MAX_ROWS, list.size()); i++) {
            Reminder r = list.get(i);
            String due = NotifFormat.dueLabel(r.dueAtMs, now, tz, locale, use24h);
            RemoteViews row = new RemoteViews(ctx.getPackageName(), R.layout.notif_pinned_row);
            row.setTextViewText(R.id.row_title, titleOf(ctx, r.title));
            row.setTextViewText(R.id.row_sub, due);
            row.setOnClickPendingIntent(R.id.row_done,
                ActionReceiver.pending(ctx, ActionReceiver.ACTION_DONE, r.id, RC_DONE_BASE + i));
            row.setOnClickPendingIntent(R.id.row_snooze,
                ActionReceiver.pending(ctx, ActionReceiver.ACTION_SNOOZE, r.id, RC_SNOOZE_BASE + i));
            row.setOnClickPendingIntent(R.id.row, openApp(ctx, RC_REMINDER_BASE + i, DeepLinks.REMINDERS));
            big.addView(R.id.rows, row);
            if (i == 0) {
                small.setTextViewText(R.id.small_title, titleOf(ctx, r.title));
                small.setTextViewText(R.id.small_sub, due);
            }
        }
    }

    private static void renderGoals(Context ctx, RemoteViews small, RemoteViews big, State s) {
        List<Goal> list = s.goals;
        if (list == null || list.isEmpty()) {
            String msg = emptyText(ctx, s, list == null, R.string.notif_no_goals);
            showEmpty(ctx, small, big, msg);
            return;
        }
        big.setViewVisibility(R.id.empty, View.GONE);
        for (int i = 0; i < Math.min(MAX_ROWS, list.size()); i++) {
            Goal g = list.get(i);
            int pct = NotifFormat.percent(g.progress);
            String pctText = ctx.getString(R.string.notif_pct, pct);
            RemoteViews row = new RemoteViews(ctx.getPackageName(), R.layout.notif_pinned_row);
            row.setTextViewText(R.id.row_title, titleOf(ctx, g.title));
            row.setTextViewText(R.id.row_pct, pctText);
            row.setViewVisibility(R.id.row_pct, View.VISIBLE);
            row.setViewVisibility(R.id.row_sub, View.GONE);
            row.setViewVisibility(R.id.row_progress, View.VISIBLE);
            row.setProgressBar(R.id.row_progress, 100, pct, false);
            row.setViewVisibility(R.id.row_done, View.GONE);
            row.setViewVisibility(R.id.row_snooze, View.GONE);
            row.setOnClickPendingIntent(R.id.row, openApp(ctx, RC_GOAL_BASE + i, DeepLinks.goalPath(g.id)));
            big.addView(R.id.rows, row);
            if (i == 0) {
                small.setTextViewText(R.id.small_title, titleOf(ctx, g.title));
                small.setTextViewText(R.id.small_sub, pctText);
            }
        }
    }

    private static void renderNotes(Context ctx, RemoteViews small, RemoteViews big, State s) {
        List<Note> list = s.notes;
        if (list == null || list.isEmpty()) {
            String msg = emptyText(ctx, s, list == null, R.string.notif_no_notes);
            showEmpty(ctx, small, big, msg);
            return;
        }
        big.setViewVisibility(R.id.empty, View.GONE);
        for (int i = 0; i < Math.min(MAX_ROWS, list.size()); i++) {
            Note n = list.get(i);
            String preview = NotifFormat.notePreview(n.body);
            int subVisibility = preview.isEmpty() ? View.GONE : View.VISIBLE;
            RemoteViews row = new RemoteViews(ctx.getPackageName(), R.layout.notif_pinned_row);
            row.setTextViewText(R.id.row_title, titleOf(ctx, n.title));
            row.setTextViewText(R.id.row_sub, preview);
            row.setViewVisibility(R.id.row_sub, subVisibility);
            row.setViewVisibility(R.id.row_done, View.GONE);
            row.setViewVisibility(R.id.row_snooze, View.GONE);
            row.setOnClickPendingIntent(R.id.row, openApp(ctx, RC_NOTE_BASE + i, DeepLinks.NOTES));
            big.addView(R.id.rows, row);
            if (i == 0) {
                small.setTextViewText(R.id.small_title, titleOf(ctx, n.title));
                small.setTextViewText(R.id.small_sub, preview);
                small.setViewVisibility(R.id.small_sub, subVisibility);
            }
        }
    }

    private static String emptyText(Context ctx, State s, boolean notLoaded, int emptyRes) {
        if (notLoaded) return ctx.getString(s.loadFailed ? R.string.notif_load_failed : R.string.notif_loading);
        return ctx.getString(emptyRes);
    }

    private static void showEmpty(Context ctx, RemoteViews small, RemoteViews big, String msg) {
        big.setViewVisibility(R.id.empty, View.VISIBLE);
        big.setTextViewText(R.id.empty, msg);
        small.setTextViewText(R.id.small_title, msg);
        small.setViewVisibility(R.id.small_sub, View.GONE);
    }

    private static String titleOf(Context ctx, String title) {
        return title == null || title.trim().isEmpty() ? ctx.getString(R.string.notif_untitled) : title;
    }

    /** Opens the app; {@code path} (nullable) is a same-origin deep link loaded by MainActivity. */
    private static PendingIntent openApp(Context ctx, int requestCode, String path) {
        Intent i = new Intent(ctx, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (path != null) i.putExtra(DeepLinks.EXTRA_PATH, path);
        return PendingIntent.getActivity(ctx, requestCode, i,
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }
}
