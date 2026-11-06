package com.echo.app;

import android.Manifest;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.view.View;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import android.webkit.WebView;
import com.echo.app.echo.DeepLinks;
import com.echo.app.echo.EchoBridgePlugin;
import com.echo.app.floating.CheckInEngine;
import com.echo.app.floating.FloatState;
import com.echo.app.update.AppUpdater;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final String PREF_MIC_ASKED = "mic_permission_asked";
    private static final int RC_MIC = 7001;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(EchoBridgePlugin.class);
        super.onCreate(savedInstanceState);
        // No echo_path handling here: BridgeActivity.load() (inside super.onCreate) already calls
        // onNewIntent(getIntent()) once the bridge exists, so cold starts are handled there.
        keepWebViewAboveKeyboard();
        askForMicOnFirstLaunch();
    }

    /**
     * Capacitor's SystemBars pads the decor view by the keyboard, and it runs first because insets go top
     * down. This adds only what that leaves uncovered, so the keyboard is never counted twice.
     */
    private void keepWebViewAboveKeyboard() {
        WebView web = getBridge() == null ? null : getBridge().getWebView();
        if (web == null || !(web.getParent() instanceof View)) return;
        View decor = getWindow().getDecorView();
        ViewCompat.setOnApplyWindowInsetsListener((View) web.getParent(), (holder, insets) -> {
            int ime = WindowInsetsCompat.Type.ime();
            int keyboard = insets.isVisible(ime) ? insets.getInsets(ime).bottom : 0;
            holder.setPadding(0, 0, 0, Math.max(0, keyboard - decor.getPaddingBottom()));
            return insets;
        });
    }

    @Override
    public void onStart() {
        super.onStart();
        AppUpdater.checkOnOpen(this);
    }

    @Override
    public void onResume() {
        super.onResume();
        FloatState.appInForeground = true;
        AppUpdater.onResume(this);
        CheckInEngine.syncOnAppVisible(this);
    }

    @Override
    public void onPause() {
        FloatState.appInForeground = false;
        CheckInEngine.onAppLeft(this);
        super.onPause();
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        // Any in-app call died with this Activity's WebView, and its page could not say so.
        FloatState.appCallActive = false;
    }

    /**
     * Asks for the microphone once, on the first launch after install, so voice works without the
     * user hunting through Android settings. Later mic requests from the site still go through
     * Capacitor's WebChromeClient, which asks again if needed.
     */
    private void askForMicOnFirstLaunch() {
        SharedPreferences prefs = getSharedPreferences("echo_app", MODE_PRIVATE);
        if (prefs.getBoolean(PREF_MIC_ASKED, false)) return;
        prefs.edit().putBoolean(PREF_MIC_ASKED, true).apply();
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
            == PackageManager.PERMISSION_GRANTED) return;
        ActivityCompat.requestPermissions(this, new String[] { Manifest.permission.RECORD_AUDIO }, RC_MIC);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        openEchoPath(intent);
    }

    /** Loads {@code <server url> + echo_path} from a notification tap; in-app view links only (/?view=...). */
    private void openEchoPath(Intent intent) {
        if (intent == null) return;
        String path = intent.getStringExtra(DeepLinks.EXTRA_PATH);
        if (path == null) return;
        intent.removeExtra(DeepLinks.EXTRA_PATH); // handle once (not again on recreate)
        Bridge bridge = getBridge();
        if (bridge == null) return;
        final String url = DeepLinks.resolveViewPath(bridge.getServerUrl(), path);
        final WebView webView = bridge.getWebView();
        if (url == null || webView == null) return;
        webView.post(() -> webView.loadUrl(url));
    }
}
