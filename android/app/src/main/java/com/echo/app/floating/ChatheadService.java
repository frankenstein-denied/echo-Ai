package com.echo.app.floating;

import android.animation.ObjectAnimator;
import android.animation.ValueAnimator;
import android.annotation.SuppressLint;
import android.view.animation.AccelerateDecelerateInterpolator;
import com.echo.app.echo.CheckInPrefs;
import android.app.Notification;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.Rect;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.SystemClock;
import android.util.DisplayMetrics;
import android.util.Log;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.LayoutInflater;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewConfiguration;
import android.view.WindowManager;
import android.window.OnBackInvokedCallback;
import android.window.OnBackInvokedDispatcher;
import android.webkit.WebView;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;
import androidx.core.app.NotificationChannelCompat;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.app.ServiceCompat;
import androidx.core.content.ContextCompat;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.echo.app.MainActivity;
import com.echo.app.R;
import com.echo.app.echo.DeepLinks;
import com.echo.app.echo.FirestoreJson;
import com.echo.app.echo.PinnedController;
import com.echo.app.echo.SessionStore;
import java.util.List;
import java.util.TimeZone;

/**
 * A draggable Echo bubble over other apps. Tapping it opens the diary in a floating panel (an
 * embedded WebView). It hosts the CheckInEngine, which drives the small message, the red number
 * and the dozing look. Main thread only, except stop(). teardown() is the single way out and is
 * idempotent; it also runs when the system stops the service, so only removeByUser() marks the
 * bubble as removed.
 */
public class ChatheadService extends Service implements CheckInEngine.Host {
    private static final String TAG = "Chathead";
    private static final String TIMING_TAG = "CheckInTiming";
    private static final String EXTRA_USER_ASKED = "echo_chathead_user_asked";
    private static final String EXTRA_OPEN_CHAT = "echo_chathead_open_chat";
    /** Tells the chat page to have the mic ready for an answer to a check-in. The page may ignore it. */
    private static final String MIC_READY_JS =
        "window.dispatchEvent(new CustomEvent('echofloat:checkin-answer',{detail:{mic:true}}))";
    private static final String CHANNEL_ID = "echo_chathead";
    private static final int NOTIFICATION_ID = 4203;
    static final float HEAD_DP = 56f;
    private static final float TARGET_DP = 64f;
    private static final float TARGET_BOTTOM_DP = 48f;
    private static final float PANEL_MARGIN_DP = 12f;
    private static final float PANEL_TOP_DP = 48f;
    private static final float PANEL_MIN_DP = 200f;
    private static final int NO_SAVED_Y = -1;
    private static final long KEYBOARD_SETTLE_MS = 120L;
    private static final float PANEL_HEIGHT_FRACTION = 0.8f;
    static final float DIM_WINDOW_ALPHA = 0.8f; // Android 12+ blocks touches through anything more opaque
    private static final float MESSAGE_MAX_WIDTH_DP = 240f;
    private static final float MESSAGE_GAP_DP = 4f;
    private static final float MESSAGE_SLIDE_DP = 24f;
    private static final float MESSAGE_CORNER_DP = 14f;
    private static final float MESSAGE_TAIL_DP = 4f;
    private static final long MESSAGE_SLIDE_MS = 150L;
    private static final long MESSAGE_VISIBLE_MS = 2_500L;
    private static final long WARM_KEEP_MS = 30 * 60_000L;
    /** A check-in with answers stays beside the bubble this long, unless answered first. */
    private static final long CHECK_IN_VISIBLE_MS = 15_000L;
    private static final float CHECK_IN_MAX_WIDTH_DP = 264f;
    private static final float CHIP_GAP_DP = 6f;

    /** Panel root that turns Back into "shrink". */
    private final class PanelRoot extends FrameLayout {
        private OnBackInvokedCallback backCallback;

        PanelRoot(Context ctx) {
            super(ctx);
        }

        // Targeting Android 16, Back may arrive as a back-invoked callback instead of a key event.
        @Override protected void onAttachedToWindow() {
            super.onAttachedToWindow();
            if (Build.VERSION.SDK_INT >= 33) {
                OnBackInvokedDispatcher d = findOnBackInvokedDispatcher();
                if (d != null) {
                    backCallback = () -> closePanel();
                    d.registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT, backCallback);
                }
            }
        }

        @Override protected void onDetachedFromWindow() {
            if (Build.VERSION.SDK_INT >= 33 && backCallback != null) {
                OnBackInvokedDispatcher d = findOnBackInvokedDispatcher();
                if (d != null) d.unregisterOnBackInvokedCallback(backCallback);
                backCallback = null;
            }
            super.onDetachedFromWindow();
        }

        @Override public boolean dispatchKeyEvent(KeyEvent event) {
            if (event.getKeyCode() == KeyEvent.KEYCODE_BACK) {
                if (event.getAction() == KeyEvent.ACTION_UP) closePanel();
                return true;
            }
            return super.dispatchKeyEvent(event);
        }
    }

    private final EchoFloatInterface.Listener pageListener = new EchoFloatInterface.Listener() {
        @Override public void onCallPhase(String phase) {
            // Not expected in chat mode.
        }

        @Override public void onCallEnded(String reason) {
            // Not expected in chat mode.
        }

        @Override public void onSignedOut() {
            if (tornDown) return;
            if (panelOpen) openApp(null); // only when the user is looking at the panel
            stop(ChatheadService.this); // not a removal: the bubble may return after the next sign-in
        }

        @Override public void onOpenInApp() {
            openApp(DeepLinks.DIARY);
            closePanel();
        }

        @Override public void onRefreshNotification() {
            try {
                PinnedController.refresh(ChatheadService.this);
            } catch (RuntimeException e) {
                Log.w(TAG, "notification refresh failed", e);
            }
        }

        @Override public void onPanelReady() {
            if (tornDown || web == null) return;
            webReady = true;
            if (micOnReady && panelOpen) sendMicReady();
            if (tapAtMs > 0) logTapToReady(tapAtMs, "cold"); // can fire with no tap on a warmed panel, and more than once
            tapAtMs = 0;
        }

        @Override public void onRendererGone() {
            if (tornDown) return;
            closePanel();
            destroyWeb(); // recreated on the next open
        }
    };

    private static volatile boolean showing;
    /** The newest start failure in this process, so BubbleBringUp needn't wait out its timeout. */
    static volatile String lastFailure;

    private final Handler main = new Handler(Looper.getMainLooper());
    private final Runnable hideMessage = this::removeMessage;
    private final Runnable dropWarmWeb = this::dropWebIfUnopened;

    private WindowManager windows;
    private View head;
    private ImageView headImage;
    private TextView headBadge;
    private WindowManager.LayoutParams headParams;
    private View message;
    private View removeTarget;
    private View dim;
    private PanelRoot panel;
    private WindowManager.LayoutParams panelParams;
    private int panelFullHeight;
    private int headYBeforeKeyboard = NO_SAVED_Y;
    private Runnable pendingFit = () -> {};
    private FrameLayout panelBody;
    private WebView web;
    private String webDay; // the local day the page was loaded
    private boolean webReady;
    private long tapAtMs; // set while a tap waits for the page; 0 otherwise
    private boolean micOnReady; // the panel opened for a check-in answer, before the page was ready
    private CheckInEngine engine;
    private boolean dozing;
    private int headLook = R.drawable.ic_echo_head;
    private ObjectAnimator bob;
    private static final long MOOD_TICK_MS = 30_000L;
    private static final long BOB_HALF_BEAT_MS = 260L;
    private boolean panelOpen;
    private boolean tornDown;
    private int latestStartId = -1; // -1 stops whatever came in, for a teardown before any start
    private int screenW;
    private int screenH;
    private int headSize;
    private int targetSize;

    /** A start the user asked for, from a visible Activity. Does nothing new when the chathead is already showing. */
    public static void show(Context ctx) {
        start(ctx, true);
    }

    /** A start the user did not ask for: a failure stays out of their way. */
    static void showQuietly(Context ctx) {
        start(ctx, false);
    }

    /** A background start. Throws what Android refuses with, so BubbleBringUp can try another way. */
    static void launch(Context ctx) {
        ContextCompat.startForegroundService(ctx,
            new Intent(ctx, ChatheadService.class).putExtra(EXTRA_USER_ASKED, false));
    }

    /**
     * From a visible Activity: the bubble with its chat open, for an answer in words to a check-in. Starts the
     * bubble if it isn't up.
     */
    static void openChat(Context ctx) {
        try {
            ContextCompat.startForegroundService(ctx, new Intent(ctx, ChatheadService.class)
                .putExtra(EXTRA_USER_ASKED, true).putExtra(EXTRA_OPEN_CHAT, true));
        } catch (RuntimeException e) {
            Log.w(TAG, "could not open the chat", e);
            recordError(ctx, "start refused: " + e.getClass().getSimpleName());
            Toast.makeText(ctx, R.string.float_chathead_start_failed, Toast.LENGTH_LONG).show();
        }
    }

    public static boolean isShowing() {
        return showing;
    }

    private static void start(Context ctx, boolean userAsked) {
        if (showing) return;
        try {
            ContextCompat.startForegroundService(ctx,
                new Intent(ctx, ChatheadService.class).putExtra(EXTRA_USER_ASKED, userAsked));
        } catch (RuntimeException e) {
            Log.w(TAG, "could not start the chathead service", e);
            recordError(ctx, "start refused: " + e.getClass().getSimpleName());
            if (userAsked) Toast.makeText(ctx, R.string.float_chathead_start_failed, Toast.LENGTH_LONG).show();
        }
    }

    /** Settings shows this, because the owner has no adb. Null clears it. */
    static void recordError(Context ctx, String reason) {
        lastFailure = reason;
        try {
            SessionStore.get(ctx.getApplicationContext()).setLastBubbleError(reason);
        } catch (IllegalStateException e) {
            Log.w(TAG, "could not save the failure");
        }
    }

    /**
     * Any thread. Not for the X: this leaves a bubble free to return. Only a service that has reached
     * startForeground is stopped, because stopping one before that crashes the app; onStartCommand
     * turns away a start that is still in flight.
     */
    public static void stop(Context ctx) {
        if (showing) ctx.stopService(new Intent(ctx, ChatheadService.class));
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        latestStartId = startId;
        boolean sticky = intent == null; // Android brought a killed bubble back; nothing waits on startForeground
        if (sticky && !showing && !stillWanted()) {
            teardown();
            return START_NOT_STICKY;
        }
        // Before anything else: every startForegroundService must be answered within seconds.
        boolean foreground = enterForeground();
        if (tornDown) { // a start that landed after teardown: answered above, so it may now stop too
            stopSelf(startId);
            return START_NOT_STICKY;
        }
        boolean openChat = intent != null && intent.getBooleanExtra(EXTRA_OPEN_CHAT, false);
        if (showing) { // a second start while the first is alive: its answer replaces the first's
            if (openChat) openChatForAnswer();
            return START_STICKY;
        }
        boolean userAsked = intent != null && intent.getBooleanExtra(EXTRA_USER_ASKED, false);
        if (!foreground) {
            failToStart(userAsked); // enterForeground recorded why
            return START_NOT_STICKY;
        }
        if (!sticky && !signedIn()) { // signed out while this start was in flight
            teardown();
            return START_NOT_STICKY;
        }
        showing = true;
        try {
            addHead();
        } catch (WindowManager.BadTokenException | SecurityException e) {
            Log.w(TAG, "overlay refused", e);
            recordError(this, "overlay refused: " + e.getClass().getSimpleName());
            failToStart(userAsked);
            return START_NOT_STICKY;
        } catch (RuntimeException e) {
            Log.w(TAG, "could not show the chathead", e);
            recordError(this, "head failed: " + e.getClass().getSimpleName());
            failToStart(userAsked);
            return START_NOT_STICKY;
        }
        recordError(this, null);
        startEngine();
        main.removeCallbacks(moodTick);
        moodTick.run();
        if (openChat) openChatForAnswer();
        return START_STICKY;
    }

    private boolean stillWanted() {
        try {
            return CheckInEngine.bubbleWanted(getApplicationContext());
        } catch (RuntimeException e) {
            Log.w(TAG, "could not read the bubble settings", e);
            return false;
        }
    }

    private boolean signedIn() {
        try {
            return SessionStore.get(getApplicationContext()).hasSession();
        } catch (IllegalStateException e) {
            return false;
        }
    }

    /** The bubble works without check-ins, so a failure here leaves it up. */
    private void startEngine() {
        try {
            engine = new CheckInEngine(this, this);
            engine.start();
        } catch (RuntimeException e) {
            Log.w(TAG, "check-ins could not start", e);
            recordError(this, "check-ins failed: " + e.getClass().getSimpleName());
            stopEngine();
        }
    }

    private void stopEngine() {
        if (engine == null) return;
        try {
            engine.stop(); // also clears FloatState.bubbleRunning, which hands firing to the background path
        } catch (RuntimeException e) {
            Log.w(TAG, "check-ins did not stop cleanly", e);
        }
        engine = null;
    }

    @Override public void onDestroy() {
        teardown();
        super.onDestroy();
    }

    /** The manifest keeps this service alive past a swipe from recents, but a phone maker may not. */
    @Override public void onTaskRemoved(Intent rootIntent) {
        CheckInAlarm.scheduleRestart(this);
        super.onTaskRemoved(rootIntent);
    }

    @Override public IBinder onBind(Intent intent) {
        return null;
    }

    private boolean enterForeground() {
        try {
            ServiceCompat.startForeground(this, NOTIFICATION_ID, buildNotification(),
                ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
            return true;
        } catch (RuntimeException e) {
            Log.w(TAG, "startForeground refused", e);
            recordError(this, "foreground refused: " + e.getClass().getSimpleName());
            return false;
        }
    }

    private Notification buildNotification() {
        NotificationManagerCompat.from(this).createNotificationChannel(
            new NotificationChannelCompat.Builder(CHANNEL_ID, NotificationManagerCompat.IMPORTANCE_MIN)
                .setName(getString(R.string.float_chathead_channel_name))
                .setDescription(getString(R.string.float_chathead_channel_desc))
                .setShowBadge(false)
                .setSound(null, null)
                .setVibrationEnabled(false)
                .setLightsEnabled(false)
                .build());
        PendingIntent open = PendingIntent.getActivity(this, NOTIFICATION_ID, appIntent(null),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_echo)
            .setContentTitle(getString(R.string.float_chathead_notification))
            .setContentIntent(open)
            .setOngoing(true)
            .setSilent(true)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .build();
    }

    // ---- windows ----

    @SuppressLint("ClickableViewAccessibility")
    private void addHead() {
        windows = (WindowManager) getSystemService(Context.WINDOW_SERVICE);
        float density = getResources().getDisplayMetrics().density;
        headSize = Math.round(HEAD_DP * density);
        targetSize = Math.round(TARGET_DP * density);
        measureScreen();

        head = LayoutInflater.from(this).inflate(R.layout.float_head, null);
        headImage = head.findViewById(R.id.float_head_image);
        headBadge = head.findViewById(R.id.float_head_badge);
        head.setOnTouchListener(new HeadTouch());

        headParams = overlayParams(headSize, headSize, ChatheadGeometry.FLAG_NOT_FOCUSABLE);
        headParams.gravity = Gravity.TOP | Gravity.START;
        headParams.x = screenW - headSize;
        headParams.y = ChatheadGeometry.clampY(screenH / 3, headSize, screenH);
        windows.addView(head, headParams);
    }

    private void addRemoveTarget() {
        if (removeTarget != null || windows == null) return;
        View v = LayoutInflater.from(this).inflate(R.layout.float_remove_target, null);
        WindowManager.LayoutParams p = overlayParams(targetSize, targetSize,
            ChatheadGeometry.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE);
        p.gravity = Gravity.TOP | Gravity.START;
        p.x = (screenW - targetSize) / 2;
        p.y = targetTop();
        try {
            windows.addView(v, p);
            removeTarget = v;
        } catch (RuntimeException e) {
            Log.w(TAG, "could not show the remove target", e);
        }
    }

    private int targetTop() {
        float density = getResources().getDisplayMetrics().density;
        return screenH - targetSize - Math.round(TARGET_BOTTOM_DP * density);
    }

    private void removeRemoveTarget() {
        removeWindow(removeTarget);
        removeTarget = null;
    }

    // ---- check-in host ----

    @Override public boolean isPanelOpen() {
        return panelOpen;
    }

    /** Its own window that touches pass through. A failure here must never reach the engine or the bubble. */
    @Override public void showMessage(String shortText) {
        if (tornDown || windows == null || head == null || panelOpen) return;
        try {
            removeMessage();
            measureScreen();
            float density = getResources().getDisplayMetrics().density;
            int gap = Math.round(MESSAGE_GAP_DP * density);
            int maxWidth = Math.min(Math.round(MESSAGE_MAX_WIDTH_DP * density), screenW - headSize - 2 * gap);

            View v = LayoutInflater.from(this).inflate(R.layout.float_message, null);
            TextView text = v.findViewById(R.id.float_message_text);
            text.setText(shortText);
            v.measure(View.MeasureSpec.makeMeasureSpec(maxWidth, View.MeasureSpec.AT_MOST),
                View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED));
            int width = v.getMeasuredWidth();
            int height = v.getMeasuredHeight();

            WindowManager.LayoutParams p = overlayParams(width, height,
                ChatheadGeometry.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE);
            p.alpha = DIM_WINDOW_ALPHA; // any more opaque and Android 12+ swallows touches on the app below
            p.gravity = Gravity.TOP | Gravity.START;
            p.x = ChatheadGeometry.messageX(headParams.x, headSize, width, screenW, gap);
            p.y = ChatheadGeometry.clampY(headParams.y + (headSize - height) / 2, height, screenH);

            boolean besideLeftHead = p.x > headParams.x;
            if (besideLeftHead) pointTailLeft(v.findViewById(R.id.float_message_card), density);
            float slide = MESSAGE_SLIDE_DP * density;
            v.setTranslationX(besideLeftHead ? -slide : slide); // comes out from behind the bubble
            v.setAlpha(0f);

            windows.addView(v, p);
            message = v;
            v.animate().translationX(0f).alpha(1f).setDuration(MESSAGE_SLIDE_MS);
            main.postDelayed(hideMessage, MESSAGE_SLIDE_MS + MESSAGE_VISIBLE_MS);
        } catch (RuntimeException e) {
            Log.w(TAG, "could not show the small message", e);
            removeMessage();
        }
    }

    /**
     * The check-in beside the bubble with its one-tap answers as chips. Unlike the small message it takes taps,
     * so it is opaque (only windows that let touches through must stay see-through). A newer one replaces it.
     */
    @Override public void showCheckIn(CheckInPlanner.Plan plan, String checkInId, long askedAtMs) {
        if (tornDown || windows == null || head == null || panelOpen) return;
        List<CheckInAnswer.Option> options = CheckInAnswer.options(plan.topic);
        if (CheckInAnswer.answerId(checkInId) == null || options.isEmpty()) {
            showMessage(plan.shortText);
            return;
        }
        try {
            removeMessage();
            measureScreen();
            float density = getResources().getDisplayMetrics().density;
            int gap = Math.round(MESSAGE_GAP_DP * density);
            int maxWidth = Math.min(Math.round(CHECK_IN_MAX_WIDTH_DP * density), screenW - headSize - 2 * gap);

            View v = LayoutInflater.from(this).inflate(R.layout.float_check_in, null);
            TextView text = v.findViewById(R.id.float_message_text);
            text.setText(plan.fullText);
            text.setOnClickListener(x -> openPanel());
            LinearLayout rows = v.findViewById(R.id.float_check_in_answers);
            // The card's own padding and the window's shadow room come off the width the chips may use.
            int chipRoom = maxWidth - Math.round((2 * 12 + 2 * 6) * density);
            addChipRows(rows, options, chipRoom, density, o -> onChip(o, plan, checkInId, askedAtMs));

            v.measure(View.MeasureSpec.makeMeasureSpec(maxWidth, View.MeasureSpec.AT_MOST),
                View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED));
            int width = v.getMeasuredWidth();
            int height = v.getMeasuredHeight();

            WindowManager.LayoutParams p = overlayParams(width, height, ChatheadGeometry.FLAG_NOT_FOCUSABLE);
            p.gravity = Gravity.TOP | Gravity.START;
            p.x = ChatheadGeometry.messageX(headParams.x, headSize, width, screenW, gap);
            p.y = ChatheadGeometry.clampY(headParams.y + (headSize - height) / 2, height, screenH);

            boolean besideLeftHead = p.x > headParams.x;
            if (besideLeftHead) pointTailLeft(v.findViewById(R.id.float_message_card), density);
            float slide = MESSAGE_SLIDE_DP * density;
            v.setTranslationX(besideLeftHead ? -slide : slide);
            v.setAlpha(0f);

            windows.addView(v, p);
            message = v;
            v.animate().translationX(0f).alpha(1f).setDuration(MESSAGE_SLIDE_MS);
            main.postDelayed(hideMessage, MESSAGE_SLIDE_MS + CHECK_IN_VISIBLE_MS);
        } catch (RuntimeException e) {
            Log.w(TAG, "could not show the check-in", e);
            removeMessage();
        }
    }

    private interface ChipTap {
        void onTap(CheckInAnswer.Option option);
    }

    /** Chips left to right, starting a new row when the next one would not fit. */
    private void addChipRows(LinearLayout rows, List<CheckInAnswer.Option> options,
                             int maxRowWidth, float density, ChipTap tap) {
        int chipGap = Math.round(CHIP_GAP_DP * density);
        LinearLayout row = null;
        int used = 0;
        for (int i = 0; i < options.size(); i++) {
            CheckInAnswer.Option o = options.get(i);
            TextView chip = new TextView(this);
            boolean words = o.kind == CheckInAnswer.Kind.OPEN_CHAT;
            chip.setText(words && CheckInAnswer.TELL.equals(o.code) ? "🎤 " + o.label : o.label);
            boolean face = CheckInAnswer.isFace(o);
            chip.setTextSize(face ? 20f : 13f);
            boolean primary = i == 0 && !face;
            chip.setTextColor(primary ? 0xFF04201C : 0xFF14181D);
            chip.setBackgroundResource(primary ? R.drawable.bg_float_chip_primary : R.drawable.bg_float_chip);
            int padH = Math.round((face ? 8 : 12) * density);
            int padV = Math.round((face ? 4 : 8) * density);
            chip.setPadding(padH, padV, padH, padV);
            chip.setMinHeight(Math.round(40 * density)); // a finger-sized target
            chip.setGravity(Gravity.CENTER);
            chip.setMaxLines(1);
            chip.setOnClickListener(x -> tap.onTap(o));
            chip.measure(View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED),
                View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED));
            int w = chip.getMeasuredWidth();
            if (row == null || used + chipGap + w > maxRowWidth) {
                row = new LinearLayout(this);
                row.setOrientation(LinearLayout.HORIZONTAL);
                LinearLayout.LayoutParams rp = new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
                if (rows.getChildCount() > 0) rp.topMargin = chipGap;
                rows.addView(row, rp);
                used = 0;
            }
            LinearLayout.LayoutParams cp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
            if (row.getChildCount() > 0) cp.leftMargin = chipGap;
            row.addView(chip, cp);
            used += (row.getChildCount() > 1 ? chipGap : 0) + w;
        }
    }

    /** A chip tap: saves go to the answer receiver, Later just clears it, words open the chat with the mic ready. */
    private void onChip(CheckInAnswer.Option o, CheckInPlanner.Plan plan, String checkInId, long askedAtMs) {
        removeMessage();
        if (o.kind == CheckInAnswer.Kind.SAVE) {
            sendBroadcast(CheckInAnswerReceiver.intent(this, checkInId, plan.topic, o.code, plan.reminderId,
                plan.reminderDueAtMs, askedAtMs, false));
            return;
        }
        CheckInEngine.onAnswered(this, checkInId);
        if (o.kind == CheckInAnswer.Kind.OPEN_CHAT) openChatForAnswer();
    }

    /** The chat with the question in it (the check-in is on today's page) and the mic ready once the page is. */
    private void openChatForAnswer() {
        if (tornDown) return;
        if (!panelOpen) openPanel();
        if (!panelOpen) return;
        if (webReady) sendMicReady(); else micOnReady = true;
    }

    private void sendMicReady() {
        micOnReady = false;
        if (web == null) return;
        try {
            web.evaluateJavascript(MIC_READY_JS, null);
        } catch (RuntimeException e) {
            Log.w(TAG, "could not ready the mic", e);
        }
    }

    private static void pointTailLeft(View card, float density) {
        float r = MESSAGE_CORNER_DP * density;
        float tail = MESSAGE_TAIL_DP * density;
        GradientDrawable bg = (GradientDrawable) card.getBackground().mutate();
        bg.setCornerRadii(new float[] {r, r, r, r, r, r, tail, tail}); // pairs: top left, top right, bottom right, bottom left
    }

    private void removeMessage() {
        main.removeCallbacks(hideMessage);
        if (message == null) return;
        message.animate().cancel();
        removeWindow(message);
        message = null;
    }

    @Override public void setUnread(int count) {
        if (headBadge == null) return;
        String text = ChatheadGeometry.badgeText(count);
        headBadge.setText(text);
        headBadge.setVisibility(text.isEmpty() ? View.GONE : View.VISIBLE);
    }

    @Override public void setDozing(boolean value) {
        if (headImage == null || dozing == value) return;
        dozing = value;
        applyMood();
    }

    /** Re-reads the user's world (rain, music, bedtime) every half minute while the head shows. */
    private final Runnable moodTick = new Runnable() {
        @Override public void run() {
            if (tornDown || headImage == null) return;
            applyMood();
            main.postDelayed(this, MOOD_TICK_MS);
        }
    };

    /** Dozing wins; otherwise yawn before bed, an umbrella when rain is coming, and a bob while music plays. */
    private void applyMood() {
        if (headImage == null) return;
        long now = System.currentTimeMillis();
        int image = R.drawable.ic_echo_head_sleeping;
        if (!dozing) {
            CheckInPrefs p;
            try {
                p = CheckInPrefs.fromJson(SessionStore.get(this).getCachedPrefsJson());
            } catch (RuntimeException e) { // a store that can't open still gets the default bedtime
                p = CheckInPrefs.defaults();
            }
            ChatheadMood.Look look = ChatheadMood.look(now, TimeZone.getDefault(), p.sleepStartMin, p.sleepEndMin, ChatheadMood.rainUntil(this));
            image = look == ChatheadMood.Look.YAWN ? R.drawable.ic_echo_head_yawn
                : look == ChatheadMood.Look.UMBRELLA ? R.drawable.ic_echo_head_umbrella
                : R.drawable.ic_echo_head;
        }
        if (image != headLook) {
            headLook = image;
            headImage.setImageResource(image);
        }
        setBobbing(ChatheadMood.bobs(ChatheadMood.musicPlaying(this), ChatheadMood.musicAt(this), now, dozing));
    }

    /** A gentle side-to-side rock, about two beats a second, like nodding along. */
    private void setBobbing(boolean on) {
        if (on == (bob != null) || headImage == null) return;
        if (on) {
            float tilt = 7f;
            bob = ObjectAnimator.ofFloat(headImage, View.ROTATION, -tilt, tilt);
            bob.setDuration(BOB_HALF_BEAT_MS);
            bob.setRepeatCount(ValueAnimator.INFINITE);
            bob.setRepeatMode(ValueAnimator.REVERSE);
            bob.setInterpolator(new AccelerateDecelerateInterpolator());
            bob.start();
        } else {
            bob.cancel();
            bob = null;
            headImage.setRotation(0f);
        }
    }

    /** Loads the page with no windows added, so the next tap is quick. Not worth the battery with the screen off. */
    @Override public void warmPanel() {
        if (tornDown || panelOpen || !screenOn()) return;
        try {
            preparePanel();
            main.removeCallbacks(dropWarmWeb);
            main.postDelayed(dropWarmWeb, WARM_KEEP_MS);
        } catch (RuntimeException e) {
            Log.w(TAG, "could not warm the panel", e);
        }
    }

    private void dropWebIfUnopened() {
        if (!panelOpen) destroyWeb();
    }

    private boolean screenOn() {
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        return pm != null && pm.isInteractive();
    }

    private void preparePanel() {
        if (panel == null) {
            panel = new PanelRoot(this);
            panel.addView(LayoutInflater.from(this).inflate(R.layout.float_panel, panel, false));
            panelBody = panel.findViewById(R.id.float_panel_body);
            panel.findViewById(R.id.float_panel_open).setOnClickListener(v -> pageListener.onOpenInApp());
        }
        String today = FirestoreJson.dateKey(System.currentTimeMillis(), TimeZone.getDefault());
        if (web == null) {
            web = EmbedWebView.create(this, EmbedWebView.PATH_CHAT, pageListener);
            web.setBackgroundColor(Color.TRANSPARENT);
            panelBody.addView(web, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
            webDay = today;
            webReady = false;
        } else if (!today.equals(webDay)) { // the page would still show yesterday
            web.reload();
            webDay = today;
            webReady = false;
        }
    }

    private static void logTapToReady(long tapMs, String kind) {
        Log.i(TIMING_TAG, "tap_to_ready_ms=" + (SystemClock.elapsedRealtime() - tapMs) + " " + kind);
    }

    private void openPanel() {
        if (panelOpen || tornDown || windows == null) return;
        long tapMs = SystemClock.elapsedRealtime();
        removeMessage();
        measureScreen();
        float density = getResources().getDisplayMetrics().density;
        int margin = Math.round(PANEL_MARGIN_DP * density);
        try {
            preparePanel();

            dim = new View(this);
            dim.setBackgroundColor(0x99000000);
            dim.setOnClickListener(v -> closePanel());
            WindowManager.LayoutParams dimParams = overlayParams(
                WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.MATCH_PARENT,
                ChatheadGeometry.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN
                    | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS);
            dimParams.alpha = DIM_WINDOW_ALPHA;
            // The keyboard is measured on the full-screen dim, never on the panel: the panel's own overlap changes
            // as it resizes, which made it bounce. Before Android 11 a window can't see the keyboard this way.
            if (Build.VERSION.SDK_INT >= 30) ViewCompat.setOnApplyWindowInsetsListener(dim, this::onScreenInsets);
            windows.addView(dim, dimParams);

            panelFullHeight = Math.round(screenH * PANEL_HEIGHT_FRACTION);
            panelParams = overlayParams(screenW - 2 * margin, panelFullHeight, ChatheadGeometry.panelFlags());
            panelParams.gravity = Gravity.TOP | Gravity.START;
            panelParams.x = margin;
            panelParams.y = Math.round(PANEL_TOP_DP * density);
            panelParams.softInputMode = WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE;
            windows.addView(panel, panelParams);
            panelOpen = true;
            FloatState.panelOpen = true;

            // Keep the bubble above the panel so tapping it again shrinks the panel.
            windows.removeViewImmediate(head);
            windows.addView(head, headParams);

            main.removeCallbacks(dropWarmWeb);
            if (engine != null) engine.onPanelOpened();
            if (webReady) logTapToReady(tapMs, "warm"); else tapAtMs = tapMs;
        } catch (RuntimeException e) {
            Log.w(TAG, "could not open the panel", e);
            Toast.makeText(this, R.string.float_chathead_start_failed, Toast.LENGTH_LONG).show();
            removePanelWindows();
            if (head != null && !head.isAttachedToWindow()) {
                try {
                    windows.addView(head, headParams);
                } catch (RuntimeException e2) {
                    Log.w(TAG, "chathead lost", e2);
                    teardown();
                }
            }
        }
    }

    /**
     * An overlay window has a fixed height, so SOFT_INPUT_ADJUST_RESIZE can't shrink it for the keyboard. The dim
     * covers the whole screen, so its keyboard inset is the keyboard's real height whatever the panel does.
     */
    private WindowInsetsCompat onScreenInsets(View view, WindowInsetsCompat insets) {
        int ime = WindowInsetsCompat.Type.ime();
        boolean keyboardVisible = insets.isVisible(ime);
        int keyboardHeight = insets.getInsets(ime).bottom;
        int[] at = new int[2];
        view.getLocationOnScreen(at);
        int keyboardTop = at[1] + view.getHeight() - keyboardHeight;
        // The keyboard slides in over many frames: resize once, after it settles, so the page lays out once.
        main.removeCallbacks(pendingFit);
        pendingFit = () -> fitPanelToKeyboard(keyboardVisible && keyboardHeight > 0, keyboardTop);
        main.postDelayed(pendingFit, KEYBOARD_SETTLE_MS);
        return insets;
    }

    private void fitPanelToKeyboard(boolean keyboardVisible, int keyboardTop) {
        if (!panelOpen || tornDown || panelParams == null || panel == null) return;
        float density = getResources().getDisplayMetrics().density;
        int[] at = new int[2];
        panel.getLocationOnScreen(at);
        int height = ChatheadGeometry.panelHeightAboveKeyboard(keyboardVisible, keyboardTop, at[1], panelFullHeight,
            Math.round(PANEL_MIN_DP * density), Math.round(PANEL_MARGIN_DP * density));
        if (Math.abs(height - panelParams.height) > 1) {
            panelParams.height = height;
            try {
                windows.updateViewLayout(panel, panelParams);
            } catch (RuntimeException e) {
                Log.w(TAG, "could not fit the panel to the keyboard", e);
            }
        }
        if (keyboardVisible) keepHeadOnPanel(); else restoreHeadY();
    }

    /** The keyboard would cover a bubble sitting low on the screen, and tapping it is how the panel shrinks. */
    private void keepHeadOnPanel() {
        if (head == null) return;
        int lowest = panelParams.y + panelParams.height - headSize;
        if (headParams.y <= lowest) return;
        if (headYBeforeKeyboard == NO_SAVED_Y) headYBeforeKeyboard = headParams.y;
        headParams.y = lowest;
        updateHead();
    }

    private void restoreHeadY() {
        if (headYBeforeKeyboard == NO_SAVED_Y) return;
        if (head != null) {
            headParams.y = headYBeforeKeyboard;
            updateHead();
        }
        headYBeforeKeyboard = NO_SAVED_Y;
    }

    private void closePanel() {
        if (!panelOpen) return;
        removePanelWindows();
    }

    private void removePanelWindows() {
        main.removeCallbacks(pendingFit);
        panelOpen = false;
        FloatState.panelOpen = false;
        micOnReady = false;
        tapAtMs = 0; // closed before the page was ready: nothing to time
        restoreHeadY();
        removeWindow(panel); // the panel view (and its WebView) is kept for the next open
        removeWindow(dim);
        dim = null;
    }

    private void destroyWeb() {
        main.removeCallbacks(dropWarmWeb);
        webReady = false;
        webDay = null;
        if (web == null) return;
        if (panelBody != null) panelBody.removeView(web);
        try {
            web.destroy();
        } catch (RuntimeException e) {
            Log.w(TAG, "WebView destroy failed", e);
        }
        web = null;
    }

    @SuppressWarnings("deprecation") // TYPE_PHONE: TYPE_APPLICATION_OVERLAY needs Android 8
    static WindowManager.LayoutParams overlayParams(int width, int height, int flags) {
        int type = Build.VERSION.SDK_INT >= 26
            ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            : WindowManager.LayoutParams.TYPE_PHONE;
        return new WindowManager.LayoutParams(width, height, type, flags, PixelFormat.TRANSLUCENT);
    }

    @SuppressWarnings("deprecation") // getRealMetrics for pre-30
    private void measureScreen() {
        if (Build.VERSION.SDK_INT >= 30) {
            Rect b = windows.getMaximumWindowMetrics().getBounds();
            screenW = b.width();
            screenH = b.height();
        } else {
            DisplayMetrics m = new DisplayMetrics();
            windows.getDefaultDisplay().getRealMetrics(m);
            screenW = m.widthPixels;
            screenH = m.heightPixels;
        }
    }

    // ---- bubble gestures ----

    private final class HeadTouch implements View.OnTouchListener {
        private float downRawX;
        private float downRawY;
        private int startX;
        private int startY;
        private long downTime;
        private boolean dragging;

        @Override public boolean onTouch(View v, MotionEvent e) {
            if (tornDown) return false;
            float slop = ViewConfiguration.get(ChatheadService.this).getScaledTouchSlop();
            switch (e.getActionMasked()) {
                case MotionEvent.ACTION_DOWN:
                    measureScreen(); // the screen may have rotated since the last gesture
                    downRawX = e.getRawX();
                    downRawY = e.getRawY();
                    startX = headParams.x;
                    startY = headParams.y;
                    downTime = e.getEventTime();
                    dragging = false;
                    return true;
                case MotionEvent.ACTION_MOVE: {
                    float dx = e.getRawX() - downRawX;
                    float dy = e.getRawY() - downRawY;
                    if (!dragging && !ChatheadGeometry.isTap(dx, dy, 0, slop)) {
                        dragging = true;
                        removeMessage(); // a check-in card would be left behind
                        addRemoveTarget();
                    }
                    if (dragging) {
                        headParams.x = Math.max(0, Math.min(startX + Math.round(dx), screenW - headSize));
                        headParams.y = ChatheadGeometry.clampY(startY + Math.round(dy), headSize, screenH);
                        updateHead();
                    }
                    return true;
                }
                case MotionEvent.ACTION_UP: {
                    float dx = e.getRawX() - downRawX;
                    float dy = e.getRawY() - downRawY;
                    boolean tap = !dragging && ChatheadGeometry.isTap(dx, dy, e.getEventTime() - downTime, slop);
                    boolean drop = dragging && overTarget();
                    dragging = false;
                    removeRemoveTarget();
                    if (drop) {
                        removeByUser();
                    } else if (tap) {
                        if (panelOpen) closePanel(); else openPanel();
                    } else {
                        snapHead();
                    }
                    return true;
                }
                case MotionEvent.ACTION_CANCEL:
                    dragging = false;
                    removeRemoveTarget();
                    snapHead();
                    return true;
                default:
                    return false;
            }
        }
    }

    private void snapHead() {
        headParams.x = ChatheadGeometry.snapX(headParams.x, headSize, screenW);
        headParams.y = ChatheadGeometry.clampY(headParams.y, headSize, screenH);
        updateHead();
    }

    @Override public void onConfigurationChanged(android.content.res.Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        if (tornDown || windows == null || head == null) return;
        measureScreen();
        removeRemoveTarget();
        removeMessage(); // it was placed for the old orientation
        closePanel(); // it was sized for the old orientation
        snapHead();
    }

    private boolean overTarget() {
        return ChatheadGeometry.overRemoveTarget(
            headParams.x + headSize / 2, headParams.y + headSize / 2,
            screenW / 2, targetTop() + targetSize / 2, targetSize);
    }

    private void updateHead() {
        try {
            windows.updateViewLayout(head, headParams);
        } catch (RuntimeException e) {
            Log.w(TAG, "could not move the chathead", e);
        }
    }

    // ---- misc ----

    /** The drop on the X, and the only path that sets the flag: a kill or a sign-out must not count as the user's choice. */
    private void removeByUser() {
        try {
            SessionStore.get(getApplicationContext()).setBubbleRemoved(true);
        } catch (IllegalStateException e) {
            Log.w(TAG, "could not save the removal", e);
        }
        teardown();
    }

    private void teardown() {
        if (tornDown) return; // also stops a late onDestroy clearing the flag of the next chathead
        tornDown = true;
        showing = false;
        stopEngine();
        removeMessage();
        removeRemoveTarget();
        removePanelWindows();
        destroyWeb();
        if (bob != null) {
            bob.cancel();
            bob = null;
        }
        removeWindow(head);
        head = null;
        headImage = null;
        headBadge = null;
        panel = null;
        panelBody = null;
        main.removeCallbacksAndMessages(null);
        stopSelf(latestStartId); // a newer start in flight keeps the service until it has called startForeground
    }

    private void removeWindow(View view) {
        if (view == null || windows == null) return;
        try {
            windows.removeViewImmediate(view);
        } catch (RuntimeException e) {
            // Never added: a failure part way through opening.
        }
    }

    private void failToStart(boolean tellUser) {
        if (tellUser) Toast.makeText(this, R.string.float_chathead_start_failed, Toast.LENGTH_LONG).show();
        teardown();
    }

    private void openApp(String path) {
        try {
            startActivity(appIntent(path));
        } catch (RuntimeException e) {
            Log.w(TAG, "could not open the app", e);
        }
    }

    private Intent appIntent(String path) {
        Intent i = new Intent(this, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (path != null) i.putExtra(DeepLinks.EXTRA_PATH, path);
        return i;
    }
}
