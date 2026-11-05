package com.echo.app.echo;

import android.content.Context;
import androidx.annotation.NonNull;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import java.util.concurrent.TimeUnit;

/** Periodic safety net: refreshes the pinned notification, or revives the service if it was killed. */
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
        return Result.success();
    }
}
