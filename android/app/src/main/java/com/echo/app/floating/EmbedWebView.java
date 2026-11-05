package com.echo.app.floating;

import android.annotation.SuppressLint;
import android.content.Context;
import android.graphics.Bitmap;
import android.net.Uri;
import android.webkit.PermissionRequest;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import com.echo.app.echo.DeepLinks;

/** Builds the origin-locked WebView that hosts the embedded chat and call pages. */
public final class EmbedWebView {
    public static final String PATH_CHAT = "/?embed=chat";
    public static final String PATH_CALL = "/?embed=call";

    private EmbedWebView() {}

    // NOTE: addJavascriptInterface exposes EchoFloat to every frame in the page. Embed pages must
    // not contain iframes (the web side must not add any); the main-frame lock does not cover them.
    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    public static WebView create(Context ctx, String path, EchoFloatInterface.Listener listener) {
        WebView web = new WebView(ctx);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);

        final EchoFloatInterface bridge = new EchoFloatInterface(listener);
        final String embedUrl = DeepLinks.resolve(null, path);
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                // Block any main-frame navigation off the site. (Not called for POST; see onPageStarted.)
                return !(request.isForMainFrame() && EmbedOrigin.isAllowed(request.getUrl().toString()));
            }

            @Override public void onPageStarted(WebView view, String url, Bitmap favicon) {
                // Backstop for loads that skip shouldOverrideUrlLoading, such as POST.
                if (!EmbedOrigin.isAllowed(url)) {
                    view.stopLoading();
                    view.loadUrl(embedUrl);
                }
            }

            @Override public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                bridge.rendererGone();
                return true; // keep the app process alive; the owner rebuilds the WebView
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public void onPermissionRequest(final PermissionRequest request) {
                boolean audioOnly = request.getResources().length == 1
                    && PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(request.getResources()[0]);
                Uri origin = request.getOrigin();
                if (audioOnly && origin != null && EmbedOrigin.isAllowed(origin.toString())) {
                    request.grant(new String[] {PermissionRequest.RESOURCE_AUDIO_CAPTURE});
                } else {
                    request.deny();
                }
            }
        });
        web.addJavascriptInterface(bridge, "EchoFloat");
        web.loadUrl(embedUrl);
        return web;
    }
}
