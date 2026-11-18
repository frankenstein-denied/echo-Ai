package com.echo.app.floating;

import android.content.Context;
import android.content.SharedPreferences;
import java.util.Calendar;
import java.util.TimeZone;

/**
 * How the chathead reacts to the user's world: an umbrella when rain is coming, a yawn in the hour before bed,
 * and a little bob while their music plays. The app (WebView) reports rain and music; sleep time comes from the
 * check-in settings. Dozing (sleep time) always wins and is set by the check-in engine.
 */
public final class ChatheadMood {
    enum Look { NORMAL, UMBRELLA, YAWN }

    static final int YAWN_MINUTES = 60;
    /** A "playing" report older than this is from an app that was closed mid-song: stop bobbing. */
    static final long MUSIC_FRESH_MS = 30 * 60_000L;

    private static final String PREFS = "echo_chathead_mood";
    private static final String RAIN_UNTIL = "rainUntilMs";
    private static final String MUSIC = "musicPlaying";
    private static final String MUSIC_AT = "musicAtMs";

    private ChatheadMood() {}

    static Look look(long nowMs, TimeZone tz, int sleepStartMin, int sleepEndMin, long rainUntilMs) {
        if (sleepStartMin != sleepEndMin) { // equal times mean never asleep
            Calendar c = Calendar.getInstance(tz);
            c.setTimeInMillis(nowMs);
            int minute = c.get(Calendar.HOUR_OF_DAY) * 60 + c.get(Calendar.MINUTE);
            int untilSleep = Math.floorMod(sleepStartMin - minute, 24 * 60);
            if (untilSleep > 0 && untilSleep <= YAWN_MINUTES) return Look.YAWN;
        }
        return rainUntilMs > nowMs ? Look.UMBRELLA : Look.NORMAL;
    }

    static boolean bobs(boolean musicPlaying, long musicAtMs, long nowMs, boolean dozing) {
        return musicPlaying && !dozing && nowMs - musicAtMs <= MUSIC_FRESH_MS;
    }

    // ---- what the app last reported ----

    public static void saveRain(Context ctx, long rainUntilMs) {
        prefs(ctx).edit().putLong(RAIN_UNTIL, Math.max(0L, rainUntilMs)).apply();
    }

    public static void saveMusic(Context ctx, boolean playing, long nowMs) {
        prefs(ctx).edit().putBoolean(MUSIC, playing).putLong(MUSIC_AT, nowMs).apply();
    }

    static long rainUntil(Context ctx) {
        return prefs(ctx).getLong(RAIN_UNTIL, 0L);
    }

    static boolean musicPlaying(Context ctx) {
        return prefs(ctx).getBoolean(MUSIC, false);
    }

    static long musicAt(Context ctx) {
        return prefs(ctx).getLong(MUSIC_AT, 0L);
    }

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
