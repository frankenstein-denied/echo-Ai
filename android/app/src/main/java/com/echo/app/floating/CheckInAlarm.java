package com.echo.app.floating;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import com.echo.app.echo.CheckInPrefs;
import com.echo.app.echo.SessionStore;
import java.util.TimeZone;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * The exact alarm behind check-ins. It fires them on time from the background, and looks in on the bubble
 * at least every 15 minutes so one that died comes back. It always schedules its own next run.
 */
public class CheckInAlarm extends BroadcastReceiver {
    private static final String TAG = "CheckInTiming";
    private static final int REQUEST_NEXT = 4301;
    private static final int REQUEST_RESTART = 4302;
    private static final long RESTART_DELAY_MS = 2_000L;
    private static final long SOON_MS = 5_000L;
    /** Android calls a receiver hung after 60 seconds. Network timeouts can add up to more than that. */
    private static final long FINISH_BY_MS = 45_000L;

    @Override public void onReceive(Context context, Intent intent) {
        Context app = context.getApplicationContext();
        Runnable finish = finishInTime(goAsync());
        armProvisional(app);
        new Thread(() -> {
            try {
                CheckInEngine.onAlarm(app, CheckInRules.WAKE_ALARM);
            } catch (RuntimeException e) {
                Log.w(TAG, "alarm failed", e);
            } finally {
                schedule(app);
                finish.run();
            }
        }, "echo-checkin-alarm").start();
    }

    /** The chain must outlive this run: if the process dies before schedule() at the end, this one still goes off. */
    private static void armProvisional(Context app) {
        try {
            set(app, REQUEST_NEXT, System.currentTimeMillis() + CheckInRules.KEEP_ALIVE_MS);
        } catch (RuntimeException e) {
            Log.w(TAG, "could not arm the provisional alarm", e);
        }
    }

    /** Run the result when the work is done. It also runs by itself before Android would call the receiver hung. */
    public static Runnable finishInTime(PendingResult pending) {
        AtomicBoolean finished = new AtomicBoolean(false);
        Handler main = new Handler(Looper.getMainLooper());
        Runnable finish = () -> {
            if (finished.compareAndSet(false, true)) pending.finish();
        };
        main.postDelayed(finish, FINISH_BY_MS);
        return () -> {
            main.removeCallbacks(finish);
            finish.run();
        };
    }

    /** Sets the next alarm to match the stored state, or cancels it when nothing should run. Any thread. */
    public static void schedule(Context ctx) {
        Context app = ctx.getApplicationContext();
        try {
            SessionStore store = SessionStore.get(app);
            if (!store.hasSession()) {
                cancel(app);
                return;
            }
            long now = System.currentTimeMillis();
            CheckInPrefs p = CheckInPrefs.fromJson(store.getCachedPrefsJson());
            if (p == null || !p.onboarded) { // the alarm reads the profile; it may have failed at boot
                set(app, REQUEST_NEXT, now + CheckInRules.KEEP_ALIVE_MS);
                return;
            }
            if (!p.enabled) {
                cancel(app);
                return;
            }
            set(app, REQUEST_NEXT, CheckInRules.nextAlarmMs(CheckInEngine.storedLastFired(store, now),
                CheckInEngine.allowedGap(p.everyMinutes), now, p.sleepStartMin, p.sleepEndMin,
                TimeZone.getDefault(), CheckInEngine.bubbleWanted(app)));
        } catch (RuntimeException e) {
            Log.w(TAG, "could not schedule the alarm", e);
        }
    }

    /** Replaces the next alarm with one in a few seconds. That run sets the real one again. */
    static void scheduleSoon(Context ctx) {
        set(ctx.getApplicationContext(), REQUEST_NEXT, System.currentTimeMillis() + SOON_MS);
    }

    /** One run shortly after the task is swiped away, in case the bubble died with it. Its own slot, so the next check-in stays set. */
    static void scheduleRestart(Context ctx) {
        Context app = ctx.getApplicationContext();
        try {
            set(app, REQUEST_RESTART, System.currentTimeMillis() + RESTART_DELAY_MS);
        } catch (RuntimeException e) {
            Log.w(TAG, "could not schedule the restart", e);
        }
    }

    public static void cancel(Context ctx) {
        Context app = ctx.getApplicationContext();
        AlarmManager alarms = (AlarmManager) app.getSystemService(Context.ALARM_SERVICE);
        if (alarms == null) return;
        alarms.cancel(pendingIntent(app, REQUEST_NEXT));
        alarms.cancel(pendingIntent(app, REQUEST_RESTART));
        noteNextWake(app, 0L);
    }

    /** The time the next alarm is set for, as Settings shows it, or null with none set. */
    public static String nextWake(SessionStore store) {
        long atMs = store.getNextWakeMs();
        return atMs <= 0 ? null : CheckInRules.when(atMs, System.currentTimeMillis(), TimeZone.getDefault());
    }

    /** The last background run, as Settings shows it, or null before the first. */
    public static String lastWake(SessionStore store) {
        String source = store.getLastWakeSource();
        if (source == null) return null;
        String when = CheckInRules.when(store.getLastWakeMs(), System.currentTimeMillis(), TimeZone.getDefault());
        return CheckInRules.wakeLine(source, when, store.getLastWakeResult());
    }

    /** Only for Settings, so a failure here must not cost the alarm. */
    private static void noteNextWake(Context app, long atMs) {
        try {
            SessionStore.get(app).setNextWakeMs(atMs);
        } catch (IllegalStateException e) {
            Log.w(TAG, "could not save the next wake");
        }
    }

    private static void set(Context app, int requestCode, long atMs) {
        AlarmManager alarms = (AlarmManager) app.getSystemService(Context.ALARM_SERVICE);
        if (alarms == null) return;
        PendingIntent pi = pendingIntent(app, requestCode);
        try {
            alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, atMs, pi);
        } catch (SecurityException e) {
            Log.w(TAG, "exact alarm refused, using an inexact one", e);
            alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, atMs, pi);
        }
        if (requestCode == REQUEST_NEXT) noteNextWake(app, atMs);
    }

    private static PendingIntent pendingIntent(Context app, int requestCode) {
        return PendingIntent.getBroadcast(app, requestCode, new Intent(app, CheckInAlarm.class),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
