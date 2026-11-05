package com.echo.app.echo;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import androidx.core.app.NotificationManagerCompat;
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
            if (userChanged) EchoNotificationService.clearCache();
            PinnedController.refresh(getContext());
            call.resolve();
        } catch (IllegalStateException e) {
            call.reject("Secure storage unavailable");
        }
    }

    @PluginMethod
    public void clearSession(PluginCall call) {
        try {
            PinnedController.stop(getContext());
            SessionStore.get(getContext()).clearSession();
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
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(i);
        } catch (Exception e) {
            try {
                Intent i = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                ctx.startActivity(i);
            } catch (Exception e2) {
                call.reject("Could not open battery settings");
                return;
            }
        }
        call.resolve();
    }

    private boolean notificationsAllowed() {
        return NotificationManagerCompat.from(getContext()).areNotificationsEnabled();
    }

    private boolean batteryOptimized() {
        PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
        return pm != null && !pm.isIgnoringBatteryOptimizations(getContext().getPackageName());
    }
}
