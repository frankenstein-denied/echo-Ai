package com.echo.app.floating;

import android.os.Handler;
import android.os.Looper;
import android.webkit.JavascriptInterface;

/** Exposed to the embedded page as window.EchoFloat. Callbacks are posted to the main thread. */
public final class EchoFloatInterface {
    public interface Listener {
        void onCallPhase(String phase);
        void onCallEnded(String reason);
        void onSignedOut();
        void onOpenInApp();
        void onRefreshNotification();
        /** The WebView renderer process died; the owner should discard and rebuild the WebView. */
        void onRendererGone();
        /** The chat page has loaded and is showing its messages. */
        void onPanelReady();
    }


    private final Listener listener;
    private final Handler main = new Handler(Looper.getMainLooper());

    public EchoFloatInterface(Listener listener) {
        this.listener = listener;
    }

    /** Not exposed to JavaScript; called by EmbedWebView's client. */
    void rendererGone() {
        main.post(listener::onRendererGone);
    }

    @JavascriptInterface public void onCallPhase(final String phase) {
        main.post(() -> listener.onCallPhase(phase));
    }

    @JavascriptInterface public void onCallEnded(final String reason) {
        main.post(() -> listener.onCallEnded(reason));
    }

    @JavascriptInterface public void onSignedOut() {
        main.post(listener::onSignedOut);
    }

    @JavascriptInterface public void openInApp() {
        main.post(listener::onOpenInApp);
    }

    @JavascriptInterface public void refreshNotification() {
        main.post(listener::onRefreshNotification);
    }

    @JavascriptInterface public void onPanelReady() {
        main.post(listener::onPanelReady);
    }
}
