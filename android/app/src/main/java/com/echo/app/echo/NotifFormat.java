package com.echo.app.echo;

import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

/** Pure text formatting for the pinned notification. No Android dependencies. */
public final class NotifFormat {
    private static final long DAY_MS = 24L * 60 * 60 * 1000;
    static final int NOTE_PREVIEW_MAX = 120;

    private NotifFormat() {}

    /**
     * Due-time label such as "Today 3:00 PM", "Tomorrow 9:30 AM", "Tue 9:00 AM", "Nov 20 9:00 AM",
     * or "Overdue · Tue 9:00 AM". Days are calendar days in {@code tz}.
     */
    public static String dueLabel(long dueMs, long nowMs, TimeZone tz, Locale locale, boolean use24h) {
        if (dueMs <= 0 || dueMs == Long.MAX_VALUE) return "No due time";
        long diff = dayIndex(dueMs, tz) - dayIndex(nowMs, tz);
        String day;
        if (diff == 0) day = "Today";
        else if (diff == 1) day = "Tomorrow";
        else if (diff == -1) day = "Yesterday";
        else if (diff > -7 && diff < 7) day = format("EEE", dueMs, tz, locale);
        else day = format("MMM d", dueMs, tz, locale);
        String label = day + " " + format(use24h ? "H:mm" : "h:mm a", dueMs, tz, locale);
        return dueMs < nowMs ? "Overdue · " + label : label;
    }

    /** One-line note preview: whitespace collapsed, capped so a huge body never reaches RemoteViews. */
    public static String notePreview(String body) {
        if (body == null) return "";
        String line = body.trim().replaceAll("\\s+", " ");
        return line.length() <= NOTE_PREVIEW_MAX ? line : line.substring(0, NOTE_PREVIEW_MAX);
    }

    /** Goal progress (0..100 scale) as a whole percent, clamped; NaN counts as 0. */
    public static int percent(double progress) {
        if (Double.isNaN(progress) || progress <= 0) return 0;
        if (progress >= 100) return 100;
        return (int) Math.round(progress);
    }

    private static String format(String pattern, long ms, TimeZone tz, Locale locale) {
        SimpleDateFormat f = new SimpleDateFormat(pattern, locale);
        f.setTimeZone(tz);
        return f.format(new Date(ms));
    }

    /** Days since epoch of the local calendar date of {@code ms} in {@code tz}. */
    private static long dayIndex(long ms, TimeZone tz) {
        Calendar local = Calendar.getInstance(tz);
        local.setTimeInMillis(ms);
        Calendar utc = Calendar.getInstance(TimeZone.getTimeZone("UTC"));
        utc.clear();
        utc.set(local.get(Calendar.YEAR), local.get(Calendar.MONTH), local.get(Calendar.DAY_OF_MONTH));
        return Math.floorDiv(utc.getTimeInMillis(), DAY_MS);
    }
}
