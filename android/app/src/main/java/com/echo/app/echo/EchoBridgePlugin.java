package com.echo.app.echo;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import com.echo.app.floating.ChatheadService;
import com.echo.app.floating.CheckInAlarm;
import com.echo.app.floating.CheckInEngine;
import com.echo.app.floating.CheckInNotifier;
import com.echo.app.floating.FloatState;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(
    name = "EchoBridge",
    permissions = {
        @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS }),
        @Permission(alias = "microphone", strings = { Manifest.permission.RECORD_AUDIO }),
        @Permission(alias = "location", strings = { Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION })
    }
)
public class EchoBridgePlugin extends Plugin {
    private static final String APP_PREFS = "echo_app";
    private static final String ASKED_PREFIX = "permission_asked_";
    /** Set by the first-launch mic ask in APKs before 1.14. */
    private static final String LEGACY_MIC_ASKED = "mic_permission_asked";

    @PluginMethod
    public void setSession(PluginCall call) {
        String uid = call.getString("uid");
        String refreshToken = call.getString("refreshToken");
        String apiKey = call.getString("apiKey");
        String projectId = call.getString("projectId");
        if (uid == null || refreshToken == null || apiKey == null || projectId == null) {
            call.reject("Missing session fields");
            return;
        }
        try {
            SessionStore store = SessionStore.get(getContext());
            boolean userChanged = !uid.equals(store.getUid());
            store.saveSession(uid, refreshToken, apiKey, projectId);
            if (userChanged) {
                EchoNotificationService.clearCache();
                CheckInNotifier.cancel(getContext());
            }
            PinnedController.refresh(getContext());
            CheckInEngine.syncOnAppVisible(getContext());
            call.resolve();
        } catch (IllegalStateException e) {
            call.reject("Secure storage unavailable");
        }
    }

    @PluginMethod
    public void clearSession(PluginCall call) {
        try {
            CheckInEngine.onSignedOut(getContext());
            PinnedController.stop(getContext());
            SessionStore.get(getContext()).clearSession();
            RefreshWorker.cancel(getContext());
            CheckInAlarm.cancel(getContext());
            CheckInNotifier.cancel(getContext());
            ChatheadService.stop(getContext()); // again: a start in flight above may have seen the session
            call.resolve();
        } catch (IllegalStateException e) {
            call.reject("Secure storage unavailable");
        }
    }

    @PluginMethod
    public void setPinned(PluginCall call) {
        Boolean pinned = call.getBoolean("pinned");
        if (pinned == null) {
            call.reject("Missing pinned");
            return;
        }
        try {
            PinnedController.setPinned(getContext(), pinned);
            call.resolve();
        } catch (IllegalStateException e) {
            call.reject("Secure storage unavailable");
        }
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        boolean pinned = false;
        try {
            pinned = SessionStore.get(getContext()).isPinned();
        } catch (IllegalStateException ignored) {
            // report not pinned
        }
        JSObject ret = new JSObject();
        ret.put("pinned", pinned);
        ret.put("notificationsAllowed", notificationsAllowed());
        ret.put("batteryOptimized", batteryOptimized());
        call.resolve(ret);
    }

    @PluginMethod
    public void refresh(PluginCall call) {
        PinnedController.refresh(getContext());
        call.resolve();
    }

    @PluginMethod
    public void isFloatingCallActive(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("active", FloatState.callRunning);
        call.resolve(ret);
    }

    @PluginMethod
    public void setAppCallActive(PluginCall call) {
        Boolean active = call.getBoolean("active");
        if (active == null) {
            call.reject("Missing active");
            return;
        }
        FloatState.appCallActive = active;
        call.resolve();
    }

    @PluginMethod
    public void setCheckInSettings(PluginCall call) {
        Boolean enabled = call.getBoolean("enabled");
        Integer everyMinutes = call.getInt("everyMinutes");
        String sleepStart = call.getString("sleepStart");
        String sleepEnd = call.getString("sleepEnd");
        Integer waterGoal = call.getInt("waterGoal");
        if (enabled == null || everyMinutes == null || sleepStart == null || sleepEnd == null || waterGoal == null) {
            call.reject("Missing check-in settings");
            return;
        }
        try {
            CheckInEngine.applySettings(getContext(), enabled, everyMinutes, sleepStart, sleepEnd, waterGoal);
            call.resolve();
        } catch (IllegalStateException e) {
            call.reject("Secure storage unavailable");
        }
    }

    @PluginMethod
    public void getCheckInStatus(PluginCall call) {
        boolean removed = false;
        String error = null;
        String lastWake = null;
        String nextWake = null;
        try {
            SessionStore store = SessionStore.get(getContext());
            removed = store.isBubbleRemoved();
            error = store.getLastBubbleError();
            lastWake = CheckInAlarm.lastWake(store);
            nextWake = CheckInAlarm.nextWake(store);
        } catch (IllegalStateException ignored) {
            // report not removed
        }
        boolean overlay = Settings.canDrawOverlays(getContext());
        boolean running = ChatheadService.isShowing() && FloatState.bubbleRunning; // a head with no engine fires nothing
        if (removed) error = "you removed it";
        else if (!overlay) error = "display over other apps is off";
        JSObject ret = new JSObject();
        ret.put("overlayAllowed", overlay);
        ret.put("bubbleRemoved", removed);
        ret.put("batteryOptimized", batteryOptimized());
        ret.put("bubbleRunning", running);
        ret.put("bubbleError", error);
        ret.put("lastWake", lastWake);
        ret.put("nextWake", nextWake);
        call.resolve(ret);
    }

    @PluginMethod
    public void openOverlaySettings(PluginCall call) {
        try {
            launch(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:" + getContext().getPackageName())));
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not open overlay settings");
        }
    }

    @PluginMethod
    public void markCheckInsRead(PluginCall call) {
        try {
            CheckInEngine.markRead(getContext());
            call.resolve();
        } catch (IllegalStateException e) {
            call.reject("Secure storage unavailable");
        }
    }

    @PluginMethod
    public void requestNotificationPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT < 33 || getPermissionState("notifications") == PermissionState.GRANTED) {
            resolveGranted(call);
            return;
        }
        markAsked("notifications");
        requestPermissionForAlias("notifications", call, "notificationPermissionCallback");
    }

    @PermissionCallback
    private void notificationPermissionCallback(PluginCall call) {
        resolveGranted(call);
    }

    private void resolveGranted(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", notificationsAllowed());
        call.resolve(ret);
    }

    @PluginMethod
    public void getPermissions(PluginCall call) {
        boolean notifications = notificationsAllowed();
        boolean microphone = granted(Manifest.permission.RECORD_AUDIO);
        boolean location = locationAllowed();
        JSObject ret = new JSObject();
        ret.put("notifications", notifications);
        ret.put("microphone", microphone);
        ret.put("location", location);
        ret.put("overlay", Settings.canDrawOverlays(getContext()));
        ret.put("canAskMicrophone", canAsk("microphone", microphone, Manifest.permission.RECORD_AUDIO));
        ret.put("canAskLocation", canAsk("location", location, Manifest.permission.ACCESS_COARSE_LOCATION));
        // Before Android 13 notifications need no pop-up, so there is nothing that could be blocked.
        ret.put("canAskNotifications", Build.VERSION.SDK_INT < 33
            || canAsk("notifications", notifications, Manifest.permission.POST_NOTIFICATIONS));
        call.resolve(ret);
    }

    @PluginMethod
    public void requestMicrophonePermission(PluginCall call) {
        if (granted(Manifest.permission.RECORD_AUDIO)) {
            resolveGranted(call, true);
            return;
        }
        markAsked("microphone");
        requestPermissionForAlias("microphone", call, "microphonePermissionCallback");
    }

    @PermissionCallback
    private void microphonePermissionCallback(PluginCall call) {
        resolveGranted(call, granted(Manifest.permission.RECORD_AUDIO));
    }

    @PluginMethod
    public void requestLocationPermission(PluginCall call) {
        if (locationAllowed()) {
            resolveGranted(call, true);
            return;
        }
        markAsked("location");
        requestPermissionForAlias("location", call, "locationPermissionCallback");
    }

    @PermissionCallback
    private void locationPermissionCallback(PluginCall call) {
        resolveGranted(call, locationAllowed());
    }

    @PluginMethod
    public void openAppSettings(PluginCall call) {
        try {
            launch(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                Uri.parse("package:" + getContext().getPackageName())));
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not open app settings");
        }
    }

    private void resolveGranted(PluginCall call, boolean granted) {
        JSObject ret = new JSObject();
        ret.put("granted", granted);
        call.resolve(ret);
    }

    private boolean granted(String permission) {
        return ContextCompat.checkSelfPermission(getContext(), permission) == PackageManager.PERMISSION_GRANTED;
    }

    /** Approximate location is enough: weather only needs the town. */
    private boolean locationAllowed() {
        return granted(Manifest.permission.ACCESS_COARSE_LOCATION) || granted(Manifest.permission.ACCESS_FINE_LOCATION);
    }

    private SharedPreferences appPrefs() {
        return getContext().getSharedPreferences(APP_PREFS, Context.MODE_PRIVATE);
    }

    private void markAsked(String alias) {
        appPrefs().edit().putBoolean(ASKED_PREFIX + alias, true).apply();
    }

    private boolean canAsk(String alias, boolean granted, String permission) {
        android.app.Activity a = getActivity();
        // Without an activity the rationale is unknown, so assume the pop-up can still show.
        if (a == null) return true;
        boolean rationale = ActivityCompat.shouldShowRequestPermissionRationale(a, permission);
        SharedPreferences prefs = appPrefs();
        boolean asked = prefs.getBoolean(ASKED_PREFIX + alias, false)
            || ("microphone".equals(alias) && prefs.getBoolean(LEGACY_MIC_ASKED, false));
        // A rationale means the pop-up was shown and turned down once, even if the WebView asked and not us.
        if (!granted && rationale && !asked) markAsked(alias);
        return canAsk(granted, asked, rationale);
    }

    /** False only when Android will no longer show the pop-up: denied, asked before, and no rationale. */
    static boolean canAsk(boolean granted, boolean askedBefore, boolean rationale) {
        return granted || !askedBefore || rationale;
    }

    @PluginMethod
    public void openBatterySettings(PluginCall call) {
        Context ctx = getContext();
        try {
            Intent i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                Uri.parse("package:" + ctx.getPackageName()));
            launch(i);
        } catch (Exception e) {
            try {
                launch(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS));
            } catch (Exception e2) {
                call.reject("Could not open battery settings");
                return;
            }
        }
        call.resolve();
    }

    /** Starts from the activity when there is one (no NEW_TASK), else from the app context. */
    private void launch(Intent i) {
        android.app.Activity a = getActivity();
        if (a != null) {
            a.startActivity(i);
        } else {
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
        }
    }

    private boolean notificationsAllowed() {
        return NotificationManagerCompat.from(getContext()).areNotificationsEnabled();
    }

    private boolean batteryOptimized() {
        PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
        return pm != null && !pm.isIgnoringBatteryOptimizations(getContext().getPackageName());
    }
}
