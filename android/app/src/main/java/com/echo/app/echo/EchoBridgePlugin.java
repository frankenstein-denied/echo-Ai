package com.echo.app.echo;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import androidx.core.app.NotificationManagerCompat;
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
    permissions = @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS })
)
public class EchoBridgePlugin extends Plugin {

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
