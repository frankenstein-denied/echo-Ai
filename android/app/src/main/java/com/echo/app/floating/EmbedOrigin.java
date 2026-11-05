package com.echo.app.floating;

import com.echo.app.echo.DeepLinks;
import java.net.URI;
import java.util.Locale;

/** Origin check for the embedded WebView: https on the live site host only. */
public final class EmbedOrigin {
    private EmbedOrigin() {}

    public static boolean isAllowed(String url) {
        if (url == null) return false;
        try {
            URI u = new URI(url);
            URI site = new URI(DeepLinks.LIVE_SITE);
            if (!"https".equalsIgnoreCase(u.getScheme())) return false;
            if (u.getRawUserInfo() != null) return false;
            String host = u.getHost();
            if (host == null) return false;
            if (!host.toLowerCase(Locale.ROOT).equals(site.getHost().toLowerCase(Locale.ROOT))) return false;
            int port = u.getPort();
            return port == -1 || port == 443;
        } catch (Exception e) {
            return false;
        }
    }
}
