package com.echo.app;

import android.content.Intent;
import android.os.Bundle;
import android.webkit.WebView;
import com.echo.app.echo.DeepLinks;
import com.echo.app.echo.EchoBridgePlugin;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(EchoBridgePlugin.class);
        super.onCreate(savedInstanceState);
        // No echo_path handling here: BridgeActivity.load() (inside super.onCreate) already calls
        // onNewIntent(getIntent()) once the bridge exists, so cold starts are handled there.
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        openEchoPath(intent);
    }

    /** Loads {@code <server url> + echo_path} from a notification tap; same-origin paths only. */
    private void openEchoPath(Intent intent) {
        if (intent == null) return;
        String path = intent.getStringExtra(DeepLinks.EXTRA_PATH);
        if (path == null) return;
        intent.removeExtra(DeepLinks.EXTRA_PATH); // handle once (not again on recreate)
        Bridge bridge = getBridge();
        if (bridge == null) return;
        final String url = DeepLinks.resolve(bridge.getServerUrl(), path);
        final WebView webView = bridge.getWebView();
        if (url == null || webView == null) return;
        webView.post(() -> webView.loadUrl(url));
    }
}
