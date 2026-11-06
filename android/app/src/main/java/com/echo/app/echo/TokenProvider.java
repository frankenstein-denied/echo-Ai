package com.echo.app.echo;

import android.content.Context;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import org.json.JSONObject;

/** Blocking id-token access via Secure Token REST. Call off the main thread. Never throws. */
public final class TokenProvider {
    private static final long MIN_REMAINING_MS = 2 * 60 * 1000L;

    private TokenProvider() {}

    /** Returns a valid id token, or null if there is no session, it was revoked, or the network failed. */
    public static synchronized String getIdToken(Context ctx) {
        try {
            SessionStore s = SessionStore.get(ctx);
            if (!s.hasSession()) return null;
            String cached = s.getIdToken();
            if (cached != null && s.getIdTokenExpiresAtMs() - System.currentTimeMillis() > MIN_REMAINING_MS) {
                return cached;
            }
            return refresh(s);
        } catch (Exception e) {
            return null;
        }
    }

    private static String refresh(SessionStore s) {
        HttpURLConnection c = null;
        try {
            URL url = new URL("https://securetoken.googleapis.com/v1/token?key="
                + URLEncoder.encode(s.getApiKey(), "UTF-8"));
            c = (HttpURLConnection) url.openConnection();
            c.setConnectTimeout(15000);
            c.setReadTimeout(15000);
            c.setRequestMethod("POST");
            c.setDoOutput(true);
            c.setRequestProperty("Content-Type", "application/x-www-form-urlencoded");
            byte[] body = ("grant_type=refresh_token&refresh_token="
                + URLEncoder.encode(s.getRefreshToken(), "UTF-8")).getBytes("UTF-8");
            OutputStream os = c.getOutputStream();
            os.write(body);
            os.close();
            int code = c.getResponseCode();
            if (code == 400) {
                s.clearAuth();
                return null;
            }
            if (code != 200) return null;
            JSONObject j = new JSONObject(read(c.getInputStream()));
            String id = j.optString("id_token", "");
            if (id.isEmpty()) return null;
            long expiresIn = j.optLong("expires_in", 3600L);
            s.saveTokens(id, System.currentTimeMillis() + expiresIn * 1000L, j.optString("refresh_token", ""));
            return id;
        } catch (Exception e) {
            return null;
        } finally {
            if (c != null) c.disconnect();
        }
    }

    static String read(InputStream in) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[4096];
        int n;
        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        in.close();
        return out.toString("UTF-8");
    }
}
