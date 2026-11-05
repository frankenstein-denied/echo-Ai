package com.echo.app.echo;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import androidx.core.app.ServiceCompat;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Foreground service that owns the pinned notification. Each start command posts the cached
 * content immediately (startForeground within 5 s), then reloads data on one background thread.
 * Swiping the app from recents does not stop it (onTaskRemoved is not overridden); START_STICKY and
 * RefreshWorker bring it back if the process is killed.
 */
public class EchoNotificationService extends Service {
    // In-memory cache shared with ActionReceiver (same process) so tab switches need no network.
    private static final Object LOCK = new Object();
    private static List<Reminder> cachedReminders;
    private static List<Goal> cachedGoals;
    private static boolean lastLoadFailed;
    private static int generation;
    private static volatile boolean running;

    private ExecutorService executor;

    public static boolean isRunning() {
        return running;
    }

    /** Drops cached data (e.g. on sign-out) so the next user never sees it. */
    public static void clearCache() {
        synchronized (LOCK) {
            cachedReminders = null;
            cachedGoals = null;
            lastLoadFailed = false;
            generation++;
        }
    }

    /**
     * Re-posts the notification from the cache without network. Returns false when the service is
     * not running or nothing is cached yet (caller should request a refresh instead).
     */
    public static boolean renderFromCache(Context ctx) {
        if (!running) return false;
        synchronized (LOCK) {
            if (cachedReminders == null && cachedGoals == null) return false;
        }
        post(ctx, buildFromCache(ctx));
        return true;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        running = true;
        executor = Executors.newSingleThreadExecutor();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Notification n = buildFromCache(this);
        try {
            if (Build.VERSION.SDK_INT >= 34) {
                ServiceCompat.startForeground(this, NotificationRenderer.NOTIFICATION_ID, n,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
            } else {
                startForeground(NotificationRenderer.NOTIFICATION_ID, n);
            }
        } catch (RuntimeException e) {
            // Not allowed to run in the foreground right now (e.g. background start on Android 12+).
            stopSelf();
            return START_NOT_STICKY;
        }
        if (!isPinned(this)) {
            // e.g. a sticky restart after the user unpinned.
            stopSelf();
            return START_NOT_STICKY;
        }
        executor.execute(this::load);
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        synchronized (LOCK) {
            running = false;
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.cancel(NotificationRenderer.NOTIFICATION_ID);
        }
        executor.shutdownNow();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void load() {
        boolean signedIn = hasSession(this);
        if (!signedIn) {
            clearCache();
            post(this, buildFromCache(this));
            return;
        }
        int gen;
        synchronized (LOCK) {
            gen = generation;
        }
        EchoApi api = new EchoApi(this);
        List<Reminder> reminders = api.listReminders();
        List<Goal> goals = api.listGoals();
        synchronized (LOCK) {
            if (gen != generation || !running) return; // signed out / stopped meanwhile
            if (reminders != null) cachedReminders = FirestoreJson.pickNextReminders(reminders, NotificationRenderer.MAX_ROWS);
            if (goals != null) cachedGoals = FirestoreJson.pickTopGoals(goals, NotificationRenderer.MAX_ROWS);
            lastLoadFailed = reminders == null || goals == null;
        }
        post(this, buildFromCache(this));
    }

    private static Notification buildFromCache(Context ctx) {
        String tab = SessionStore.TAB_REMINDERS;
        try {
            tab = SessionStore.get(ctx).getTab();
        } catch (IllegalStateException ignored) {
            // default tab
        }
        NotificationRenderer.State state;
        synchronized (LOCK) {
            state = new NotificationRenderer.State(hasSession(ctx), tab, cachedReminders, cachedGoals, lastLoadFailed);
        }
        return NotificationRenderer.build(ctx, state);
    }

    /** Updates the foreground notification; a no-op once the service is stopped. */
    private static void post(Context ctx, Notification n) {
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        synchronized (LOCK) {
            if (!running) return; // never leave a stray notification behind a stopped service
            try {
                nm.notify(NotificationRenderer.NOTIFICATION_ID, n);
            } catch (RuntimeException ignored) {
                // Notifications blocked or system error: keep running silently.
            }
        }
    }

    private static boolean hasSession(Context ctx) {
        try {
            return SessionStore.get(ctx).hasSession();
        } catch (IllegalStateException e) {
            return false;
        }
    }

    private static boolean isPinned(Context ctx) {
        try {
            return SessionStore.get(ctx).isPinned();
        } catch (IllegalStateException e) {
            return false;
        }
    }
}
