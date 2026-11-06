package com.echo.app.echo;

import android.content.Context;
import android.util.Log;
import androidx.annotation.NonNull;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import com.echo.app.floating.CheckInAlarm;
import com.echo.app.floating.CheckInEngine;
import com.echo.app.floating.CheckInRules;
import java.util.concurrent.TimeUnit;

/**
 * Periodic safety net: refreshes the pinned notification, or revives the service if it was killed. It also
 * sends any check-in the exact alarm missed, and sets that alarm again if it was lost.
 */
public class RefreshWorker extends Worker {
    static final String UNIQUE_NAME = "echo-pinned-refresh";

    public RefreshWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    public static void schedule(Context ctx) {
        try {
            PeriodicWorkRequest req = new PeriodicWorkRequest.Builder(RefreshWorker.class, 15, TimeUnit.MINUTES)
                .setConstraints(new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .build();
            WorkManager.getInstance(ctx.getApplicationContext())
                .enqueueUniquePeriodicWork(UNIQUE_NAME, ExistingPeriodicWorkPolicy.KEEP, req);
        } catch (RuntimeException ignored) {
            // WorkManager unavailable: the service still refreshes on its own start commands.
        }
    }

    /** The worker runs while the notification is pinned or check-ins are on for a signed-in user. */
    static boolean needed(boolean pinned, boolean signedIn, CheckInPrefs cachedPrefs) {
        return pinned || (signedIn && cachedPrefs != null && cachedPrefs.enabled);
    }

    /** Schedules or cancels to match the stored state. Sign-out cancels directly, because pinned survives it. */
    public static void sync(Context ctx) {
        SessionStore store;
        try {
            store = SessionStore.get(ctx);
        } catch (IllegalStateException e) {
            return;
        }
        if (needed(store.isPinned(), store.hasSession(), CheckInPrefs.fromJson(store.getCachedPrefsJson()))) {
            schedule(ctx);
        } else {
            cancel(ctx);
        }
        CheckInAlarm.schedule(ctx);
    }

    public static void cancel(Context ctx) {
        try {
            WorkManager.getInstance(ctx.getApplicationContext()).cancelUniqueWork(UNIQUE_NAME);
        } catch (RuntimeException ignored) {
            // nothing to cancel
        }
    }

    @NonNull
    @Override
    public Result doWork() {
        // refresh() no-ops unless pinned and signed in, and swallows background-start restrictions.
        PinnedController.refresh(getApplicationContext());
        try {
            CheckInEngine.onAlarm(getApplicationContext(), CheckInRules.WAKE_WORKER);
        } catch (RuntimeException e) {
            Log.w("CheckInTiming", "background check-in failed", e); // the next run tries again
        } finally {
            CheckInAlarm.schedule(getApplicationContext());
        }
        return Result.success();
    }
}
