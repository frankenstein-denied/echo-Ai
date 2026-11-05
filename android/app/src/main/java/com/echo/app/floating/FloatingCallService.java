package com.echo.app.floating;

import android.app.Notification;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.hardware.input.InputManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.SystemClock;
import android.provider.Settings;
import android.util.Log;
import android.view.Gravity;
import android.view.LayoutInflater;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebView;
import android.widget.TextView;
import android.widget.Toast;
import androidx.core.app.NotificationChannelCompat;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.app.ServiceCompat;
import androidx.core.content.ContextCompat;
import com.echo.app.MainActivity;
import com.echo.app.R;
import com.echo.app.echo.PinnedController;

/**
 * Runs one floating voice call. The embedded page holds the call in a 1x1 overlay WebView; a glow
 * window, a pill window and a small exit-button window sit above the current app. Each instance serves one call.
 * All state is touched on the main thread only. teardown() is the single way out and is idempotent.
 */
public class FloatingCallService extends Service {
    private static final String TAG = "FloatingCall";
    private static final String CHANNEL_ID = "echo_call";
    private static final int NOTIFICATION_ID = 4202;
    private static final long TICK_MS = 1000;
    /** How long the hidden page lives after hang-up, so the last turn's save can reach Firestore. */
    private static final long SAVE_FLUSH_MS = 6000;
    /** Safety net only: teardown releases the lock when the call ends. */
    private static final long WAKE_LOCK_MAX_MS = 4L * 60 * 60 * 1000;
    private static final float GLOW_WINDOW_ALPHA = 0.8f; // Android 12+ blocks touches through anything more opaque
    private static final float EXIT_BOTTOM_DP = 48f;
    private static final float PILL_BOTTOM_DP = 124f; // above the 64dp exit button, with a 12dp gap
    private static final String ACTION_END = "com.echo.app.floating.END_CALL";
    private static final String END_CALL_JS = "window.__echoFloatEnd?.()";

    private final Handler main = new Handler(Looper.getMainLooper());
    private final CallSessionState session = new CallSessionState();
    private final Runnable tick = new Runnable() {
        @Override public void run() {
            if (tornDown || exiting) return;
            if (!Settings.canDrawOverlays(FloatingCallService.this)) {
                // The overlays are gone, so there is no exit button: never leave the mic open unseen.
                Log.w(TAG, "overlay permission revoked during call");
                exit();
                return;
            }
            session.tick(now());
            sync();
            if (!tornDown && !exiting) main.postDelayed(this, TICK_MS);
        }
    };
    private final EchoFloatInterface.Listener pageListener = new EchoFloatInterface.Listener() {
        @Override public void onCallPhase(String phase) {
            session.onPhase(phase, now());
            sync();
        }

        @Override public void onCallEnded(String reason) {
            session.onEnded(reason, now());
            sync();
        }

        @Override public void onSignedOut() {
            if (tornDown) return;
            openApp();
            teardown();
        }

        @Override public void onOpenInApp() {
            // The call page has no such button.
        }

        @Override public void onRefreshNotification() {
            refreshPinned();
        }

        @Override public void onRendererGone() {
            discardPage(); // dead: nothing left to tell or to wait for
            session.onEnded("failed", now());
            sync();
        }
    };

    private WindowManager windows;
    private WebView web;
    private GlowView glow;
    private View exitButton;
    private TextView pill;
    private PowerManager.WakeLock wakeLock;
    private boolean pageEnded;
    private boolean exiting;
    private boolean tornDown;

    /** Call from a visible Activity: Android 14+ only allows microphone use if started in the foreground. */
    public static void start(Context ctx) {
        try {
            ContextCompat.startForegroundService(ctx, new Intent(ctx, FloatingCallService.class));
        } catch (RuntimeException e) {
            // FloatState.callRunning is only set once the service runs, so nothing is left to clear.
            Log.w(TAG, "could not start the call service", e);
            Toast.makeText(ctx, R.string.float_call_start_failed, Toast.LENGTH_LONG).show();
        }
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_END.equals(intent.getAction())) {
            exit(); // the notification's End call: a plain start, so no startForeground is owed
            return START_NOT_STICKY;
        }
        // Before anything else: every startForegroundService must be answered within seconds.
        boolean foreground = enterForeground();
        if (tornDown || !session.start(now())) return START_NOT_STICKY; // Talk tapped twice: no second call
        if (!foreground) {
            failToStart(R.string.float_call_start_failed);
            return START_NOT_STICKY;
        }
        FloatState.callRunning = true;
        try {
            acquireWakeLock();
            addWindows();
        } catch (WindowManager.BadTokenException | SecurityException e) {
            Log.w(TAG, "overlay refused", e);
            failToStart(R.string.float_allow_overlay);
            return START_NOT_STICKY;
        } catch (RuntimeException e) {
            // e.g. no WebView provider installed
            Log.w(TAG, "could not set up the call", e);
            failToStart(R.string.float_call_start_failed);
            return START_NOT_STICKY;
        }
        main.postDelayed(tick, TICK_MS);
        return START_NOT_STICKY; // a killed call must not come back as a stray glow
    }

    @Override public void onDestroy() {
        teardown();
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent intent) {
        return null;
    }

    private boolean enterForeground() {
        try {
            ServiceCompat.startForeground(this, NOTIFICATION_ID, buildNotification(),
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE);
            return true;
        } catch (RuntimeException e) {
            // Mic permission gone, or Echo was not in the foreground.
            Log.w(TAG, "startForeground refused", e);
            return false;
        }
    }

    private Notification buildNotification() {
        NotificationManagerCompat.from(this).createNotificationChannel(
            // Silent, but not IMPORTANCE_LOW: low notifications can be hidden on the lock screen, and
            // End call is the only way out there, because overlays do not show over it.
            new NotificationChannelCompat.Builder(CHANNEL_ID, NotificationManagerCompat.IMPORTANCE_DEFAULT)
                .setName(getString(R.string.float_call_channel_name))
                .setDescription(getString(R.string.float_call_channel_desc))
                .setShowBadge(false)
                .setSound(null, null)
                .setVibrationEnabled(false)
                .setLightsEnabled(false)
                .build());
        PendingIntent open = PendingIntent.getActivity(this, NOTIFICATION_ID, appIntent(),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        PendingIntent end = PendingIntent.getService(this, NOTIFICATION_ID,
            new Intent(this, FloatingCallService.class).setAction(ACTION_END),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_echo)
            .setContentTitle(getString(R.string.float_call_notification))
            .setContentIntent(open)
            .addAction(R.drawable.ic_float_call_end, getString(R.string.float_call_exit), end)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(true)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .build();
    }

    private void acquireWakeLock() {
        PowerManager power = (PowerManager) getSystemService(Context.POWER_SERVICE);
        wakeLock = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "echo:floating-call");
        wakeLock.setReferenceCounted(false);
        wakeLock.acquire(WAKE_LOCK_MAX_MS);
    }

    private void addWindows() {
        windows = (WindowManager) getSystemService(Context.WINDOW_SERVICE);

        web = EmbedWebView.create(this, EmbedWebView.PATH_CALL, pageListener);
        web.setBackgroundColor(Color.TRANSPARENT);
        WindowManager.LayoutParams webParams = overlayParams(1, 1,
            WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE | WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE);
        webParams.gravity = Gravity.TOP | Gravity.START;
        windows.addView(web, webParams);

        glow = new GlowView(this);
        windows.addView(glow, glowParams());

        // Separate windows, so only the button itself takes touches.
        LayoutInflater inflater = LayoutInflater.from(this);
        pill = (TextView) inflater.inflate(R.layout.float_call_pill, null);
        pill.setText(session.pillText());
        windows.addView(pill, bottomCentreParams(PILL_BOTTOM_DP,
            WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE | WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE));

        exitButton = inflater.inflate(R.layout.float_call_exit, null);
        exitButton.findViewById(R.id.float_call_exit).setOnClickListener(v -> exit());
        windows.addView(exitButton, bottomCentreParams(EXIT_BOTTOM_DP,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL));
    }

    private WindowManager.LayoutParams bottomCentreParams(float bottomDp, int flags) {
        WindowManager.LayoutParams p = overlayParams(
            WindowManager.LayoutParams.WRAP_CONTENT, WindowManager.LayoutParams.WRAP_CONTENT, flags);
        p.gravity = Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL;
        p.y = Math.round(bottomDp * getResources().getDisplayMetrics().density);
        return p;
    }

    private WindowManager.LayoutParams glowParams() {
        WindowManager.LayoutParams p = overlayParams(
            WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE | WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS);
        p.alpha = glowAlpha();
        if (Build.VERSION.SDK_INT >= 30) {
            p.setFitInsetsTypes(0);
            p.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS;
        } else if (Build.VERSION.SDK_INT >= 28) {
            p.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        }
        return p;
    }

    /** Android 12+ lets the phone maker lower the opacity limit for touches to pass through. */
    private float glowAlpha() {
        if (Build.VERSION.SDK_INT < 31) return GLOW_WINDOW_ALPHA;
        InputManager input = (InputManager) getSystemService(Context.INPUT_SERVICE);
        return Math.min(GLOW_WINDOW_ALPHA, input.getMaximumObscuringOpacityForTouch());
    }

    @SuppressWarnings("deprecation") // TYPE_PHONE: TYPE_APPLICATION_OVERLAY needs Android 8
    private static WindowManager.LayoutParams overlayParams(int width, int height, int flags) {
        int type = Build.VERSION.SDK_INT >= 26
            ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            : WindowManager.LayoutParams.TYPE_PHONE;
        return new WindowManager.LayoutParams(width, height, type, flags, PixelFormat.TRANSLUCENT);
    }

    /** Applies the session state to the screen after any event. */
    private void sync() {
        if (tornDown || exiting) return;
        if (session.shouldTearDown()) {
            finishCall();
            return;
        }
        if (pill != null) pill.setText(session.pillText());
        if (session.shouldDiscardPage()) discardPage();
        else if (session.hasFailed()) endPage();
    }

    private void exit() {
        if (tornDown || exiting) return;
        session.requestExit(now());
        finishCall();
    }

    /** Every normal end comes here. The page saves the last turn asynchronously, so it outlives the visible call. */
    private void finishCall() {
        endPage();
        if (web == null || !session.hasConnected()) {
            teardown(); // nothing to save
            return;
        }
        exiting = true;
        FloatState.callFinishing = true;
        main.removeCallbacks(tick);
        removeOverlays();
        main.postDelayed(this::teardown, SAVE_FLUSH_MS);
    }

    private void endPage() {
        if (pageEnded || web == null) return;
        pageEnded = true;
        web.evaluateJavascript(END_CALL_JS, null);
    }

    /** Destroying the page also releases the mic and stops all audio. */
    private void discardPage() {
        if (web == null) return;
        removeWindow(web);
        try {
            web.destroy();
        } catch (RuntimeException e) {
            Log.w(TAG, "WebView destroy failed", e);
        }
        web = null;
    }

    private void teardown() {
        if (tornDown) return; // also stops a late onDestroy clearing the flag of the next call
        tornDown = true;
        FloatState.callRunning = false;
        FloatState.callFinishing = false;
        main.removeCallbacksAndMessages(null);
        removeOverlays();
        discardPage();
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        wakeLock = null;
        refreshPinned();
        stopSelf();
    }

    private void removeOverlays() {
        removeWindow(glow);
        glow = null;
        removeWindow(pill);
        pill = null;
        removeWindow(exitButton);
        exitButton = null;
    }

    private void removeWindow(View view) {
        if (view == null || windows == null) return;
        try {
            windows.removeViewImmediate(view);
        } catch (RuntimeException e) {
            // Never added: the add failed part way through start-up.
        }
    }

    private void failToStart(int messageRes) {
        Toast.makeText(this, messageRes, Toast.LENGTH_LONG).show();
        teardown();
    }

    private void refreshPinned() {
        try {
            PinnedController.refresh(this);
        } catch (RuntimeException e) {
            Log.w(TAG, "notification refresh failed", e);
        }
    }

    private void openApp() {
        try {
            startActivity(appIntent());
        } catch (RuntimeException e) {
            Log.w(TAG, "could not open the app", e);
        }
    }

    private Intent appIntent() {
        return new Intent(this, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
    }

    private static long now() {
        return SystemClock.elapsedRealtime();
    }
}
