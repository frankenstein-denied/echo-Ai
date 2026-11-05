package com.echo.app.floating;

import android.annotation.SuppressLint;
import android.app.Notification;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.Rect;
import android.os.Build;
import android.os.IBinder;
import android.util.DisplayMetrics;
import android.util.Log;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.LayoutInflater;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewConfiguration;
import android.view.WindowManager;
import android.webkit.WebView;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.Toast;
import androidx.core.app.NotificationChannelCompat;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.app.ServiceCompat;
import androidx.core.content.ContextCompat;
import com.echo.app.MainActivity;
import com.echo.app.R;
import com.echo.app.echo.DeepLinks;
import com.echo.app.echo.PinnedController;

/**
 * A draggable Echo bubble over other apps. Tapping it opens the diary in a floating panel (an
 * embedded WebView). Main thread only. teardown() is the single way out and is idempotent.
 */
public class ChatheadService extends Service {
    private static final String TAG = "Chathead";
    private static final String CHANNEL_ID = "echo_chathead";
    private static final int NOTIFICATION_ID = 4203;
    private static final float HEAD_DP = 56f;
    private static final float TARGET_DP = 64f;
    private static final float TARGET_BOTTOM_DP = 48f;
    private static final float PANEL_MARGIN_DP = 12f;
    private static final float PANEL_TOP_DP = 48f;
    private static final float PANEL_HEIGHT_FRACTION = 0.8f;
    private static final float DIM_WINDOW_ALPHA = 0.8f; // Android 12+ blocks touches through anything more opaque

    /** Panel root that turns Back into "shrink". */
    private final class PanelRoot extends FrameLayout {
        PanelRoot(Context ctx) {
            super(ctx);
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
            openApp(null);
            closePanel();
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

        @Override public void onRendererGone() {
            if (tornDown) return;
            closePanel();
            destroyWeb(); // recreated on the next open
        }
    };

    private static boolean showing;

    private WindowManager windows;
    private ImageView head;
    private WindowManager.LayoutParams headParams;
    private View removeTarget;
    private View dim;
    private PanelRoot panel;
    private FrameLayout panelBody;
    private WebView web;
    private boolean panelOpen;
    private boolean tornDown;
    private int screenW;
    private int screenH;
    private int headSize;
    private int targetSize;

    /** Call from a visible Activity. Does nothing new when the chathead is already showing. */
    public static void show(Context ctx) {
        if (showing) return;
        try {
            ContextCompat.startForegroundService(ctx, new Intent(ctx, ChatheadService.class));
        } catch (RuntimeException e) {
            Log.w(TAG, "could not start the chathead service", e);
            Toast.makeText(ctx, R.string.float_chathead_start_failed, Toast.LENGTH_LONG).show();
        }
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        // Before anything else: every startForegroundService must be answered within seconds.
        boolean foreground = enterForeground();
        if (tornDown) return START_NOT_STICKY;
        if (showing) return START_NOT_STICKY; // a second start while the first is alive
        if (!foreground) {
            failToStart();
            return START_NOT_STICKY;
        }
        showing = true;
        try {
            addHead();
        } catch (WindowManager.BadTokenException | SecurityException e) {
            Log.w(TAG, "overlay refused", e);
            failToStart();
        } catch (RuntimeException e) {
            Log.w(TAG, "could not show the chathead", e);
            failToStart();
        }
        return START_NOT_STICKY; // a killed bubble must not come back by itself
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
                ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
            return true;
        } catch (RuntimeException e) {
            Log.w(TAG, "startForeground refused", e);
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

        head = new ImageView(this);
        head.setImageResource(R.drawable.ic_echo_head);
        head.setScaleType(ImageView.ScaleType.FIT_CENTER);
        head.setContentDescription(getString(R.string.float_chathead_desc));
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

    private void openPanel() {
        if (panelOpen || tornDown || windows == null) return;
        measureScreen();
        float density = getResources().getDisplayMetrics().density;
        int margin = Math.round(PANEL_MARGIN_DP * density);
        try {
            if (panel == null) {
                panel = new PanelRoot(this);
                panel.addView(LayoutInflater.from(this).inflate(R.layout.float_panel, panel, false));
                panelBody = panel.findViewById(R.id.float_panel_body);
                panel.findViewById(R.id.float_panel_open).setOnClickListener(v -> pageListener.onOpenInApp());
            }
            if (web == null) {
                web = EmbedWebView.create(this, EmbedWebView.PATH_CHAT, pageListener);
                web.setBackgroundColor(Color.TRANSPARENT);
                panelBody.addView(web, new FrameLayout.LayoutParams(
                    FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
            }

            dim = new View(this);
            dim.setBackgroundColor(0x99000000);
            dim.setOnClickListener(v -> closePanel());
            WindowManager.LayoutParams dimParams = overlayParams(
                WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.MATCH_PARENT,
                ChatheadGeometry.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN
                    | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS);
            dimParams.alpha = DIM_WINDOW_ALPHA;
            windows.addView(dim, dimParams);

            WindowManager.LayoutParams panelParams = overlayParams(
                screenW - 2 * margin, Math.round(screenH * PANEL_HEIGHT_FRACTION), ChatheadGeometry.panelFlags());
            panelParams.gravity = Gravity.TOP | Gravity.START;
            panelParams.x = margin;
            panelParams.y = Math.round(PANEL_TOP_DP * density);
            panelParams.softInputMode = WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE;
            windows.addView(panel, panelParams);
            panelOpen = true;

            // Keep the bubble above the panel so tapping it again shrinks the panel.
            windows.removeViewImmediate(head);
            windows.addView(head, headParams);
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

    private void closePanel() {
        if (!panelOpen) return;
        removePanelWindows();
    }

    private void removePanelWindows() {
        panelOpen = false;
        removeWindow(panel); // the panel view (and its WebView) is kept for the next open
        removeWindow(dim);
        dim = null;
    }

    private void destroyWeb() {
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
    private static WindowManager.LayoutParams overlayParams(int width, int height, int flags) {
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
                    boolean tap = ChatheadGeometry.isTap(dx, dy, e.getEventTime() - downTime, slop);
                    boolean drop = dragging && overTarget();
                    dragging = false;
                    removeRemoveTarget();
                    if (drop) {
                        teardown();
                    } else if (tap) {
                        if (panelOpen) closePanel(); else openPanel();
                    } else {
                        headParams.x = ChatheadGeometry.snapX(headParams.x, headSize, screenW);
                        headParams.y = ChatheadGeometry.clampY(headParams.y, headSize, screenH);
                        updateHead();
                    }
                    return true;
                }
                case MotionEvent.ACTION_CANCEL:
                    dragging = false;
                    removeRemoveTarget();
                    return true;
                default:
                    return false;
            }
        }
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

    private void teardown() {
        if (tornDown) return; // also stops a late onDestroy clearing the flag of the next chathead
        tornDown = true;
        showing = false;
        removeRemoveTarget();
        removePanelWindows();
        destroyWeb();
        removeWindow(head);
        head = null;
        panel = null;
        panelBody = null;
        stopSelf();
    }

    private void removeWindow(View view) {
        if (view == null || windows == null) return;
        try {
            windows.removeViewImmediate(view);
        } catch (RuntimeException e) {
            // Never added: a failure part way through opening.
        }
    }

    private void failToStart() {
        Toast.makeText(this, R.string.float_chathead_start_failed, Toast.LENGTH_LONG).show();
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
