package com.echo.app.update;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.widget.Toast;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * In-app updates for the sideloaded APK. On launch it reads version.json from the newest GitHub
 * release; if that version is newer it offers "Update now", downloads echo.apk with DownloadManager
 * and opens Android's installer (which always asks the user to confirm; silent installs are not
 * possible outside the Play Store). Publish new versions with scripts/release-android.sh.
 */
public final class AppUpdater {
    private static final String RELEASES = "https://github.com/frankenstein-denied/echo-Ai/releases/latest/download/";
    private static final String VERSION_URL = RELEASES + "version.json";
    private static final String APK_URL = RELEASES + "echo.apk";
    private static final String PREFS = "echo_updates";
    private static final String PREF_LAST_CHECK = "last_check_ms";
    private static final String PREF_PENDING_INSTALL = "pending_install";
    private static final long CHECK_INTERVAL_MS = 10 * 60 * 1000L; // at most every 10 min
    private static final String APK_DIR = "updates";
    private static final String APK_NAME = "echo-update.apk";

    private AppUpdater() {}

    /** Call from onCreate: checks for a newer version in the background (throttled). */
    public static void checkOnLaunch(Activity activity) {
        SharedPreferences prefs = activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        long now = System.currentTimeMillis();
        if (now - prefs.getLong(PREF_LAST_CHECK, 0) < CHECK_INTERVAL_MS) return;
        prefs.edit().putLong(PREF_LAST_CHECK, now).apply();
        final int installed = installedVersionCode(activity);
        new Thread(() -> {
            UpdateInfo info = UpdateInfo.parse(fetch(VERSION_URL));
            if (info == null || !info.isNewerThan(installed)) return;
            activity.runOnUiThread(() -> offer(activity, info));
        }, "echo-update-check").start();
    }

    /** Call from onResume: finishes an install that was waiting for "Install unknown apps". */
    public static void onResume(Activity activity) {
        SharedPreferences prefs = activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (!prefs.getBoolean(PREF_PENDING_INSTALL, false)) return;
        if (!canInstall(activity)) return;
        prefs.edit().putBoolean(PREF_PENDING_INSTALL, false).apply();
        if (apkFile(activity).exists()) install(activity);
    }

    private static void offer(Activity activity, UpdateInfo info) {
        if (activity.isFinishing() || activity.isDestroyed()) return;
        String msg = "Echo " + info.versionName + " is ready."
            + (info.notes.isEmpty() ? "" : "\n\n" + info.notes);
        new AlertDialog.Builder(activity)
            .setTitle("Update available")
            .setMessage(msg)
            .setPositiveButton("Update now", (d, w) -> download(activity))
            .setNegativeButton("Later", null)
            .show();
    }

    private static void download(Activity activity) {
        Context app = activity.getApplicationContext();
        File old = apkFile(app);
        if (old.exists()) old.delete();
        DownloadManager dm = (DownloadManager) app.getSystemService(Context.DOWNLOAD_SERVICE);
        if (dm == null) return;
        DownloadManager.Request req = new DownloadManager.Request(Uri.parse(APK_URL))
            .setTitle("Echo update")
            .setDescription("Downloading the new version of Echo")
            .setMimeType("application/vnd.android.package-archive")
            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE)
            .setDestinationInExternalFilesDir(app, APK_DIR, APK_NAME);
        final long id = dm.enqueue(req);
        Toast.makeText(activity, "Downloading update…", Toast.LENGTH_SHORT).show();

        BroadcastReceiver done = new BroadcastReceiver() {
            @Override
            public void onReceive(Context c, Intent intent) {
                if (intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1) != id) return;
                try {
                    app.unregisterReceiver(this);
                } catch (IllegalArgumentException ignored) {
                    // already unregistered
                }
                if (!succeeded(dm, id)) {
                    Toast.makeText(app, "Update download failed. Try again later.", Toast.LENGTH_LONG).show();
                    return;
                }
                install(activity);
            }
        };
        // The completion broadcast comes from the system download provider (another app), so it must be exported.
        ContextCompat.registerReceiver(app, done, new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE),
            ContextCompat.RECEIVER_EXPORTED);
    }

    private static void install(Activity activity) {
        if (!canInstall(activity)) {
            // First time only: Android needs "Install unknown apps" allowed for Echo.
            activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                .putBoolean(PREF_PENDING_INSTALL, true).apply();
            Toast.makeText(activity, "Allow Echo to install updates, then go back.", Toast.LENGTH_LONG).show();
            activity.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:" + activity.getPackageName())));
            return;
        }
        Uri uri = FileProvider.getUriForFile(activity, activity.getPackageName() + ".fileprovider", apkFile(activity));
        Intent i = new Intent(Intent.ACTION_VIEW)
            .setDataAndType(uri, "application/vnd.android.package-archive")
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            activity.startActivity(i);
        } catch (RuntimeException e) {
            Toast.makeText(activity, "Could not open the installer.", Toast.LENGTH_LONG).show();
        }
    }

    private static boolean canInstall(Context ctx) {
        return Build.VERSION.SDK_INT < 26 || ctx.getPackageManager().canRequestPackageInstalls();
    }

    private static boolean succeeded(DownloadManager dm, long id) {
        try (Cursor c = dm.query(new DownloadManager.Query().setFilterById(id))) {
            return c != null && c.moveToFirst()
                && c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS)) == DownloadManager.STATUS_SUCCESSFUL;
        } catch (RuntimeException e) {
            return false;
        }
    }

    private static File apkFile(Context ctx) {
        return new File(ctx.getExternalFilesDir(APK_DIR), APK_NAME);
    }

    private static int installedVersionCode(Context ctx) {
        try {
            PackageInfo p = ctx.getPackageManager().getPackageInfo(ctx.getPackageName(), 0);
            return Build.VERSION.SDK_INT >= 28 ? (int) p.getLongVersionCode() : p.versionCode;
        } catch (PackageManager.NameNotFoundException e) {
            return Integer.MAX_VALUE; // never offer an update if we can't tell
        }
    }

    /** GET a small text file, following GitHub's redirect to its download host. Null on any failure. */
    private static String fetch(String url) {
        HttpURLConnection conn = null;
        try {
            conn = (HttpURLConnection) new URL(url).openConnection();
            conn.setConnectTimeout(10000);
            conn.setReadTimeout(10000);
            conn.setInstanceFollowRedirects(true);
            if (conn.getResponseCode() != 200) return null;
            try (InputStream in = conn.getInputStream()) {
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                byte[] buf = new byte[4096];
                int n;
                while ((n = in.read(buf)) != -1 && out.size() < 64 * 1024) out.write(buf, 0, n);
                return new String(out.toByteArray(), StandardCharsets.UTF_8);
            }
        } catch (Exception e) {
            return null;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }
}
