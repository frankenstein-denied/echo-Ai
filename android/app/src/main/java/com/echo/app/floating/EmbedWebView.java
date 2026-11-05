package com.echo.app.floating;

import android.annotation.SuppressLint;
import android.content.Context;
import android.net.Uri;
import android.webkit.PermissionRequest;
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

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    public static WebView create(Context ctx, String path, EchoFloatInterface.Listener listener) {
        WebView web = new WebView(ctx);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);

        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                // Never navigate away from the site; block everything else, including subframes.
                return !(request.isForMainFrame() && EmbedOrigin.isAllowed(request.getUrl().toString()));
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
        web.addJavascriptInterface(new EchoFloatInterface(listener), "EchoFloat");
        web.loadUrl(DeepLinks.resolve(null, path));
        return web;
    }
}
