package com.echo.app.update;

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
import java.util.concurrent.TimeUnit;

/** Every 6 hours, for every user: posts a notification when a new version of Echo is out. */
public class UpdateCheckWorker extends Worker {
    static final String UNIQUE_NAME = "echo_update_check";

    public UpdateCheckWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    /** Safe to call on every open: KEEP leaves an existing schedule alone. */
    public static void schedule(Context ctx) {
        try {
            PeriodicWorkRequest req = new PeriodicWorkRequest.Builder(UpdateCheckWorker.class,
                    UpdateNotifier.CHECK_EVERY_MS, TimeUnit.MILLISECONDS)
                .setConstraints(new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .build();
            WorkManager.getInstance(ctx.getApplicationContext())
                .enqueueUniquePeriodicWork(UNIQUE_NAME, ExistingPeriodicWorkPolicy.KEEP, req);
        } catch (RuntimeException ignored) {
            // WorkManager unavailable: the dialog on open still offers updates.
        }
    }

    @NonNull
    @Override
    public Result doWork() {
        try {
            UpdateNotifier.maybeNotify(getApplicationContext());
        } catch (RuntimeException e) {
            Log.w("EchoUpdates", "update check failed", e); // the next run tries again
        }
        return Result.success();
    }
}
