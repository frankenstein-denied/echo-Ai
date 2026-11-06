package com.echo.app.floating;

import android.app.KeyguardManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.os.SystemClock;
import android.provider.Settings;
import android.util.Log;
import androidx.core.content.ContextCompat;
import com.echo.app.echo.CheckInPrefs;
import com.echo.app.echo.EchoApi;
import com.echo.app.echo.FirestoreJson;
import com.echo.app.echo.RefreshWorker;
import com.echo.app.echo.SessionStore;
import java.util.TimeZone;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Fires check-ins while the bubble is up, on a main-thread timer, and owns the quiet path for when it is not.
 * Instance methods are main thread only. The static entry points are safe from any thread.
 */
public final class CheckInEngine {
    /** What the engine needs from the bubble. Always called on the main thread. */
    public interface Host {
        boolean isPanelOpen();
        void showMessage(String shortText);
        void setUnread(int count);
        void setDozing(boolean dozing);
        void warmPanel();
    }

    private static final String TAG = "CheckInTiming";
    private static final long MINUTE_MS = 60_000L;
    private static final long TICK_MS = MINUTE_MS;
    private static final long PREFETCH_MS = 5 * MINUTE_MS;
    private static final long UNLOCK_CAP_MS = 1_500L;
    private static final int DEFAULT_GAP = 120;
    private static final String ID_PREFIX = "checkin-";
    private static final int DAY_KEY_LENGTH = 10;

    /** One write at a time across the engine and the quiet path: two could each create a page for the same message. */
    private static final AtomicBoolean WRITING = new AtomicBoolean(false);
    private static final AtomicBoolean SYNCING = new AtomicBoolean(false);
    private static volatile CheckInEngine active;

    private final Context ctx;
    private final Host host;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final EchoApi api;
    private final Runnable tickRunnable = () -> tick(false);
    private final Runnable unlockCap = this::finishUnlock;
    private final BroadcastReceiver screenReceiver = new BroadcastReceiver() {
        @Override public void onReceive(Context c, Intent intent) {
            String action = intent == null ? null : intent.getAction();
            if (Intent.ACTION_USER_PRESENT.equals(action)) {
                onUnlock();
            } else if (Intent.ACTION_SCREEN_ON.equals(action)) {
                onScreenOn();
            } else if (Intent.ACTION_SCREEN_OFF.equals(action)) {
                main.removeCallbacks(tickRunnable);
            }
        }
    };

    private ExecutorService workers;
    private boolean running;
    private CheckInPrefs prefs;
    private TodaySnapshot snapshot;
    private boolean fetching;
    private boolean loadingProfile;
    private boolean unlockWaiting;
    private boolean fireWhenFetched;
    private long lastFetchAttemptMs;
    private long unlockAtMs;

    public CheckInEngine(Context ctx, Host host) {
        this.ctx = ctx.getApplicationContext();
        this.host = host;
        this.api = new EchoApi(this.ctx);
    }

    // ---- lifecycle ----

    public void start() {
        if (running) return;
        SessionStore store;
        try {
            store = SessionStore.get(ctx);
        } catch (IllegalStateException e) {
            Log.w(TAG, "no storage, check-ins stay off");
            return;
        }
        running = true;
        active = this;
        FloatState.bubbleRunning = true;
        workers = Executors.newCachedThreadPool();
        storedLastFired(store, System.currentTimeMillis());
        prefs = CheckInPrefs.fromJson(store.getCachedPrefsJson());
        host.setUnread(store.getUnreadCount());
        IntentFilter filter = new IntentFilter();
        filter.addAction(Intent.ACTION_USER_PRESENT);
        filter.addAction(Intent.ACTION_SCREEN_ON);
        filter.addAction(Intent.ACTION_SCREEN_OFF);
        ContextCompat.registerReceiver(ctx, screenReceiver, filter, ContextCompat.RECEIVER_NOT_EXPORTED);
        tick(false);
    }

    public void stop() {
        if (!running) return;
        running = false;
        if (active == this) active = null;
        FloatState.bubbleRunning = false;
        main.removeCallbacks(tickRunnable);
        main.removeCallbacks(unlockCap);
        unlockWaiting = false;
        fireWhenFetched = false;
        fetching = false;
        loadingProfile = false;
        snapshot = null;
        workers.shutdown(); // a write in progress still finishes
        try {
            ctx.unregisterReceiver(screenReceiver);
        } catch (IllegalArgumentException e) {
            // never registered
        }
    }

    public void onPanelOpened() {
        if (!running) return;
        try {
            clearUnread(SessionStore.get(ctx));
            host.setUnread(0);
        } catch (RuntimeException e) {
            Log.w(TAG, "could not clear the unread number", e);
        }
    }

    /** Picks up settings that were just cached, with no network. */
    public void reloadPrefs() {
        if (!running) return;
        try {
            CheckInPrefs cached = CheckInPrefs.fromJson(SessionStore.get(ctx).getCachedPrefsJson());
            if (cached != null) prefs = cached;
        } catch (IllegalStateException e) {
            return;
        }
        tick(false);
    }

    // ---- the timer ----

    private void tick(boolean allowTodaysCopy) {
        if (!running) return;
        try {
            runTick(allowTodaysCopy);
        } catch (RuntimeException e) {
            Log.w(TAG, "tick failed", e);
        }
        scheduleNextTick();
    }

    private void scheduleNextTick() {
        main.removeCallbacks(tickRunnable);
        if (!running || !isInteractive()) return; // the screen receiver starts it again
        long delay = TICK_MS;
        try {
            CheckInPrefs p = prefs;
            if (p != null) {
                delay = msUntilNextTick(SessionStore.get(ctx).getLastFiredMs(), allowedGap(p.everyMinutes),
                    System.currentTimeMillis());
            }
        } catch (IllegalStateException e) {
            // keep the plain minute
        }
        main.postDelayed(tickRunnable, delay);
    }

    private void runTick(boolean allowTodaysCopy) {
        SessionStore store = SessionStore.get(ctx);
        CheckInPrefs p = prefs;
        if (p == null) {
            host.setDozing(false);
            if (store.hasSession()) loadProfile();
            return;
        }
        long now = System.currentTimeMillis();
        TimeZone tz = TimeZone.getDefault();
        String today = FirestoreJson.dateKey(now, tz);
        if (dropOldPending(store, today)) host.setUnread(store.getUnreadCount());

        CheckInRules.State s = currentState(store, p, now, tz);
        CheckInRules.Outcome outcome = CheckInRules.decide(s);
        host.setDozing(outcome == CheckInRules.Outcome.SLEEPING);

        if (s.pendingWrite && s.signedIn && s.online) writeInBackground(false);
        if (outcome == CheckInRules.Outcome.NOT_DUE || outcome == CheckInRules.Outcome.WAIT) {
            prefetchIfNear(s, now);
            return;
        }
        if (outcome != CheckInRules.Outcome.POPUP && outcome != CheckInRules.Outcome.CHAT_ONLY) return;

        TodaySnapshot usable = pickSnapshot(snapshot, today, now, allowTodaysCopy);
        if (usable == null) { // counts as WAIT: the next tick, or the fetch landing, tries again
            fireWhenFetched = true;
            refreshSnapshot(false);
            return;
        }
        fire(store, usable, s, outcome == CheckInRules.Outcome.POPUP, today, tz);
    }

    private CheckInRules.State currentState(SessionStore store, CheckInPrefs p, long now, TimeZone tz) {
        CheckInRules.State s = baseState(p, now, storedLastFired(store, now), tz);
        s.signedIn = store.hasSession();
        s.bubbleRunning = true;
        s.screenOn = screenUsable(isInteractive(), isKeyguardLocked());
        s.inCall = inCall();
        s.appInForeground = FloatState.appInForeground;
        s.online = isOnline(ctx);
        s.panelOpen = host.isPanelOpen();
        s.pendingWrite = store.getPendingCheckInId() != null;
        s.quietUnread = store.getQuietUnread();
        return s;
    }

    private void prefetchIfNear(CheckInRules.State s, long now) {
        if (!s.online || msUntilPrefetch(s.lastFiredMs, s.everyMinutes, now) > 0) return;
        if (now - lastFetchAttemptMs >= PREFETCH_MS) refreshSnapshot(true);
    }

    /** Message first: everything else on this path comes after the user can see it. */
    private void fire(SessionStore store, TodaySnapshot usable, CheckInRules.State s, boolean popup,
                      String today, TimeZone tz) {
        CheckInPlanner.Plan plan = CheckInPlanner.plan(usable, parseTopic(store.getLastTopic()), s.nowMs, tz,
            s.everyMinutes, s.sleepStartMin, s.sleepEndMin);
        if (popup) {
            host.showMessage(plan.shortText);
            Log.i(TAG, "due_to_visible_ms="
                + (System.currentTimeMillis() - visibleFromMs(s.lastFiredMs, s.everyMinutes, unlockAtMs)));
            int unread = store.getUnreadCount() + 1;
            store.setUnreadCount(unread);
            host.setUnread(unread);
        }
        unlockAtMs = 0;
        recordFired(store, plan, s.nowMs, today);
        writeInBackground(true);
    }

    // ---- unlock ----

    /** USER_PRESENT may never come on a phone with no lock screen, so an unlocked screen coming on counts as the unlock. */
    private void onScreenOn() {
        if (isKeyguardLocked()) tick(false); else onUnlock();
    }

    private void onUnlock() {
        if (!running) return;
        unlockAtMs = System.currentTimeMillis();
        try {
            if (!unlockNeedsFetch()) {
                tick(false);
                return;
            }
        } catch (RuntimeException e) {
            Log.w(TAG, "unlock check failed", e);
            tick(false);
            return;
        }
        scheduleNextTick();
        unlockWaiting = true;
        main.removeCallbacks(unlockCap);
        main.postDelayed(unlockCap, UNLOCK_CAP_MS);
        refreshSnapshot(false);
    }

    private boolean unlockNeedsFetch() {
        CheckInPrefs p = prefs;
        if (p == null) return false;
        long now = System.currentTimeMillis();
        TimeZone tz = TimeZone.getDefault();
        CheckInRules.Outcome o = CheckInRules.decide(currentState(SessionStore.get(ctx), p, now, tz));
        boolean firing = o == CheckInRules.Outcome.POPUP || o == CheckInRules.Outcome.CHAT_ONLY;
        return firing && pickSnapshot(snapshot, FirestoreJson.dateKey(now, tz), now, false) == null;
    }

    private void finishUnlock() {
        if (!unlockWaiting) return;
        unlockWaiting = false;
        main.removeCallbacks(unlockCap);
        tick(true);
    }

    // ---- background work ----

    /** Off the main thread; the result comes back on it. The profile is left out when every millisecond counts. */
    private void refreshSnapshot(boolean readProfile) {
        CheckInPrefs p = prefs;
        if (!running || fetching || p == null) return;
        fetching = true;
        lastFetchAttemptMs = System.currentTimeMillis();
        workers.execute(() -> {
            long started = SystemClock.elapsedRealtime();
            CheckInPrefs fresh = readProfile ? api.getProfilePrefs() : null;
            TodaySnapshot got = api.loadToday(fresh != null ? fresh : p, TimeZone.getDefault());
            Log.i(TAG, "fetch_ms=" + (SystemClock.elapsedRealtime() - started));
            main.post(() -> onFetched(fresh, got));
        });
    }

    private void onFetched(CheckInPrefs fresh, TodaySnapshot got) {
        if (!running) return;
        fetching = false;
        if (fresh != null) cacheProfile(fresh);
        if (got != null) snapshot = got;
        if (unlockWaiting) {
            finishUnlock();
        } else if (fireWhenFetched) {
            fireWhenFetched = false;
            if (got != null) tick(false); // a failed fetch waits for the next tick, so it can't spin
        }
    }

    private void loadProfile() {
        if (!running || loadingProfile) return;
        loadingProfile = true;
        workers.execute(() -> {
            CheckInPrefs fresh = api.getProfilePrefs();
            main.post(() -> {
                if (!running) return;
                loadingProfile = false;
                if (fresh != null) cacheProfile(fresh);
            });
        });
    }

    private void cacheProfile(CheckInPrefs fresh) {
        try {
            SessionStore store = SessionStore.get(ctx);
            if (!store.hasSession()) return; // signed out while the read was in flight
            store.setCachedPrefsJson(fresh.toJson());
            prefs = fresh;
        } catch (IllegalStateException e) {
            Log.w(TAG, "could not cache the profile");
        }
    }

    private void writeInBackground(boolean retryOnce) {
        if (!WRITING.compareAndSet(false, true)) return;
        workers.execute(() -> {
            boolean written = false;
            try {
                written = writeStored(ctx, api, SessionStore.get(ctx), retryOnce);
            } catch (RuntimeException e) {
                Log.w(TAG, "write failed", e);
            } finally {
                WRITING.set(false);
            }
            if (written) main.post(this::onWritten);
        });
    }

    /** Only now can the panel find today's page. An open panel is already showing it. */
    private void onWritten() {
        try {
            if (running && !host.isPanelOpen()) host.warmPanel();
        } catch (RuntimeException e) {
            Log.w(TAG, "could not warm the panel", e);
        }
    }

    // ---- system state ----

    private boolean isInteractive() {
        PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
        return pm != null && pm.isInteractive();
    }

    private boolean isKeyguardLocked() {
        KeyguardManager km = (KeyguardManager) ctx.getSystemService(Context.KEYGUARD_SERVICE);
        return km != null && km.isKeyguardLocked();
    }

    private static boolean isOnline(Context ctx) {
        try {
            ConnectivityManager cm = (ConnectivityManager) ctx.getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm == null) return false;
            Network network = cm.getActiveNetwork();
            NetworkCapabilities caps = network == null ? null : cm.getNetworkCapabilities(network);
            return caps != null && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
        } catch (RuntimeException e) {
            return false;
        }
    }

    // ---- the quiet path ----

    /** Blocking; call off the main thread. Writes a check-in to the chat when no bubble can show one. */
    public static void runQuietPath(Context ctx) {
        Context app = ctx.getApplicationContext();
        if (FloatState.bubbleRunning) return; // the engine owns firing
        SessionStore store;
        try {
            store = SessionStore.get(app);
        } catch (IllegalStateException e) {
            return;
        }
        if (!store.hasSession()) return;

        EchoApi api = new EchoApi(app);
        CheckInPrefs p = api.getProfilePrefs();
        if (p == null) p = CheckInPrefs.fromJson(store.getCachedPrefsJson());
        else if (store.hasSession()) store.setCachedPrefsJson(p.toJson());
        if (p == null || !p.onboarded) return;

        long now = System.currentTimeMillis();
        TimeZone tz = TimeZone.getDefault();
        String today = FirestoreJson.dateKey(now, tz);
        dropOldPending(store, today);
        boolean online = isOnline(app);
        if (online && store.getPendingCheckInId() != null) writeQuietly(app, api, store, false);

        CheckInRules.State s = baseState(p, now, storedLastFired(store, now), tz);
        s.signedIn = true;
        s.bubbleRunning = false;
        s.online = online;
        s.pendingWrite = store.getPendingCheckInId() != null;
        s.quietUnread = store.getQuietUnread();
        if (CheckInRules.decide(s) != CheckInRules.Outcome.QUIET) return;

        TodaySnapshot data = api.loadToday(p, tz);
        if (!FirestoreJson.snapshotIsUsable(data, today, now)) return; // the next run tries again
        if (FloatState.bubbleRunning) return; // it came up during the fetch
        CheckInPlanner.Plan plan = CheckInPlanner.plan(data, parseTopic(store.getLastTopic()), now, tz,
            s.everyMinutes, s.sleepStartMin, s.sleepEndMin);
        store.setUnreadCount(store.getUnreadCount() + 1);
        store.setQuietUnread(1);
        recordFired(store, plan, now, today);
        writeQuietly(app, api, store, true);
    }

    private static void writeQuietly(Context app, EchoApi api, SessionStore store, boolean retryOnce) {
        if (!WRITING.compareAndSet(false, true)) return;
        try {
            writeStored(app, api, store, retryOnce);
        } finally {
            WRITING.set(false);
        }
    }

    // ---- shared by both paths ----

    /** Fills the pending slot before any network, so a check-in the user was told about survives a kill. */
    private static void recordFired(SessionStore store, CheckInPlanner.Plan plan, long nowMs, String today) {
        store.setLastFiredMs(nowMs);
        store.setLastTopic(plan.topic.name());
        store.setPendingCheckInText(plan.fullText);
        store.setPendingCheckInId(newMessageId(today));
    }

    /** Writes what is in the pending slot and empties it on success. The id never changes, so a retry can't double-send. */
    private static boolean writeStored(Context ctx, EchoApi api, SessionStore store, boolean retryOnce) {
        String id = store.getPendingCheckInId();
        String text = store.getPendingCheckInText();
        String uid = store.getUid();
        if (id == null || text == null || uid == null) return false;
        TimeZone tz = TimeZone.getDefault();
        long started = SystemClock.elapsedRealtime();
        boolean written = api.writeCheckIn(id, text, tz);
        if (!written && retryOnce && uid.equals(store.getUid())) written = api.writeCheckIn(id, text, tz);
        Log.i(TAG, "write_ms=" + (SystemClock.elapsedRealtime() - started) + " ok=" + written);
        if (written && id.equals(store.getPendingCheckInId())) clearPending(store);
        return written;
    }

    /** Yesterday's message must not land on today's page, and the number must stop counting it. */
    private static boolean dropOldPending(SessionStore store, String today) {
        String id = store.getPendingCheckInId();
        String text = store.getPendingCheckInText();
        if ((id == null && text == null) || pendingIsKept(id, text, today)) return false;
        clearPending(store);
        int unread = Math.max(0, store.getUnreadCount() - 1);
        store.setUnreadCount(unread);
        if (unread == 0) store.setQuietUnread(0);
        return true;
    }

    private static void clearPending(SessionStore store) {
        store.setPendingCheckInId(null);
        store.setPendingCheckInText(null);
    }

    private static void clearUnread(SessionStore store) {
        store.setUnreadCount(0);
        store.setQuietUnread(0);
    }

    private static long storedLastFired(SessionStore store, long nowMs) {
        long stored = store.getLastFiredMs();
        long effective = effectiveLastFired(stored, nowMs);
        if (effective != stored) store.setLastFiredMs(effective);
        return effective;
    }

    // ---- entry points for the app, the bridge and the boot receiver ----

    /** Call when the full app shows or a session arrives. Reads the profile if it has to, then starts the bubble. */
    public static void syncOnAppVisible(Context ctx) {
        Context app = ctx.getApplicationContext();
        if (!SYNCING.compareAndSet(false, true)) return;
        new Thread(() -> {
            try {
                SessionStore store = SessionStore.get(app);
                if (!store.hasSession()) return;
                CheckInPrefs cached = CheckInPrefs.fromJson(store.getCachedPrefsJson());
                if (cached == null || !cached.onboarded) { // a new user finishes onboarding after the first read
                    CheckInPrefs fresh = new EchoApi(app).getProfilePrefs();
                    if (fresh != null && store.hasSession()) store.setCachedPrefsJson(fresh.toJson());
                }
                RefreshWorker.sync(app);
                startBubbleWhileVisible(app);
            } catch (RuntimeException e) {
                Log.w(TAG, "app-open sync failed", e);
            } finally {
                SYNCING.set(false);
            }
        }, "echo-checkin-sync").start();
    }

    /** From a boot receiver, which may start a foreground service. Cached prefs only. */
    public static void startBubbleFromCache(Context ctx) {
        Context app = ctx.getApplicationContext();
        if (bubbleWanted(app)) ChatheadService.showQuietly(app);
    }

    private static void startBubbleWhileVisible(Context app) {
        if (!bubbleWanted(app)) return;
        new Handler(Looper.getMainLooper()).post(() -> {
            if (FloatState.appInForeground) ChatheadService.showQuietly(app); // Android only allows this while visible
        });
    }

    static boolean bubbleWanted(Context app) {
        SessionStore store = SessionStore.get(app);
        return shouldAutoStart(CheckInPrefs.fromJson(store.getCachedPrefsJson()), store.hasSession(),
            Settings.canDrawOverlays(app), store.isBubbleRemoved());
    }

    /**
     * Settings from the web, which has already saved them to the profile. With no cache yet there is nothing
     * to merge into, so the profile is read instead. Off then on brings back a removed bubble and restarts the gap.
     */
    public static void applySettings(Context ctx, boolean enabled, int everyMinutes, String sleepStart,
                                     String sleepEnd, int waterGoal) {
        Context app = ctx.getApplicationContext();
        SessionStore store = SessionStore.get(app);
        CheckInPrefs cached = CheckInPrefs.fromJson(store.getCachedPrefsJson());
        if (cached == null) {
            syncOnAppVisible(app);
            return;
        }
        if (turnedOn(cached, enabled)) {
            store.setBubbleRemoved(false);
            store.setLastFiredMs(System.currentTimeMillis());
        }
        store.setCachedPrefsJson(CheckInPrefs.merged(cached, enabled, everyMinutes, sleepStart, sleepEnd, waterGoal).toJson());
        RefreshWorker.sync(app);
        onActive(CheckInEngine::reloadPrefs);
        startBubbleWhileVisible(app);
    }

    /** Clears both counters, and the number on the bubble if there is one. */
    public static void markRead(Context ctx) {
        clearUnread(SessionStore.get(ctx.getApplicationContext()));
        onActive(e -> e.host.setUnread(0));
    }

    /** The single place sign-out shuts check-ins down. */
    public static void onSignedOut(Context ctx) {
        onActive(CheckInEngine::stop);
        ChatheadService.stop(ctx);
    }

    private interface EngineAction {
        void run(CheckInEngine engine);
    }

    private static void onActive(EngineAction action) {
        new Handler(Looper.getMainLooper()).post(() -> {
            CheckInEngine engine = active;
            if (engine == null) return;
            try {
                action.run(engine);
            } catch (RuntimeException e) {
                Log.w(TAG, "engine call failed", e);
            }
        });
    }

    // ---- pure logic ----

    /** How long until the data for the next check-in should be fetched. 0 inside the 5-minute window, never negative. */
    static long msUntilPrefetch(long lastFiredMs, int everyMinutes, long nowMs) {
        return Math.max(0, lastFiredMs + everyMinutes * MINUTE_MS - PREFETCH_MS - nowMs);
    }

    /** A minute, or less when a check-in falls due sooner, so it fires on time and not up to a minute late. */
    static long msUntilNextTick(long lastFiredMs, int everyMinutes, long nowMs) {
        long untilDue = lastFiredMs + everyMinutes * MINUTE_MS - nowMs;
        return untilDue > 0 && untilDue < TICK_MS ? untilDue : TICK_MS;
    }

    static int allowedGap(int minutes) {
        return FirestoreJson.isCheckInGap(minutes) ? minutes : DEFAULT_GAP;
    }

    /** Unset seeds to now, so nothing fires the moment the feature starts. A future time means the clock moved back. */
    static long effectiveLastFired(long storedMs, long nowMs) {
        return storedMs <= 0 || storedMs > nowMs ? nowMs : storedMs;
    }

    /** The fields of {@link CheckInRules.State} that come from the settings and the clock. */
    static CheckInRules.State baseState(CheckInPrefs p, long nowMs, long lastFiredMs, TimeZone tz) {
        CheckInRules.State s = new CheckInRules.State();
        s.enabled = p.enabled;
        s.nowMs = nowMs;
        s.lastFiredMs = lastFiredMs;
        s.everyMinutes = allowedGap(p.everyMinutes);
        s.minuteOfDay = CheckInPlanner.minuteOfDay(nowMs, tz);
        s.sleepStartMin = p.sleepStartMin;
        s.sleepEndMin = p.sleepEndMin;
        return s;
    }

    /** No popup over the lock screen, so locked counts as off. */
    static boolean screenUsable(boolean interactive, boolean keyguardLocked) {
        return interactive && !keyguardLocked;
    }

    static boolean inCall() {
        return FloatState.callRunning || FloatState.appCallActive || FloatState.callFinishing;
    }

    /** A usable snapshot; after an unlock whose fetch ran out of time, any copy from today. Never another day's. */
    static TodaySnapshot pickSnapshot(TodaySnapshot s, String todayKey, long nowMs, boolean allowTodaysCopy) {
        if (FirestoreJson.snapshotIsUsable(s, todayKey, nowMs)) return s;
        return allowTodaysCopy && s != null && todayKey.equals(s.dateKey) ? s : null;
    }

    /** The local day is part of the id, so a pending check-in always knows when it was made. */
    static String newMessageId(String dayKey) {
        return ID_PREFIX + dayKey + "-" + UUID.randomUUID();
    }

    static String pendingDay(String messageId) {
        int end = ID_PREFIX.length() + DAY_KEY_LENGTH;
        if (messageId == null || !messageId.startsWith(ID_PREFIX) || messageId.length() < end) return null;
        return messageId.substring(ID_PREFIX.length(), end);
    }

    static boolean pendingIsKept(String id, String text, String today) {
        return text != null && today.equals(pendingDay(id));
    }

    /** When the wait the user could see began: the moment it fell due, or the unlock if that came later. */
    static long visibleFromMs(long lastFiredMs, int everyMinutes, long unlockAtMs) {
        return Math.max(lastFiredMs + everyMinutes * MINUTE_MS, unlockAtMs);
    }

    static CheckInPlanner.Topic parseTopic(String name) {
        if (name == null) return null;
        try {
            return CheckInPlanner.Topic.valueOf(name);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    /** Beyond {@link CheckInRules#shouldStartBubble}: native must have read the profile, and the user finished onboarding. */
    static boolean shouldAutoStart(CheckInPrefs cached, boolean signedIn, boolean overlayGranted, boolean removed) {
        return cached != null && cached.onboarded
            && CheckInRules.shouldStartBubble(cached.enabled, signedIn, overlayGranted, removed);
    }

    static boolean turnedOn(CheckInPrefs cached, boolean enabledNow) {
        return cached != null && !cached.enabled && enabledNow;
    }
}
