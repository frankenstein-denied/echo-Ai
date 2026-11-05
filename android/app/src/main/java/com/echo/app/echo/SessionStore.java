package com.echo.app.echo;

import android.content.Context;
import android.content.SharedPreferences;
import androidx.security.crypto.EncryptedSharedPreferences;
import androidx.security.crypto.MasterKeys;

/** Encrypted storage for the native session and notification prefs. Never log values. */
public final class SessionStore {
    public static final String TAB_REMINDERS = "reminders";
    public static final String TAB_GOALS = "goals";

    private static SessionStore instance;
    private final SharedPreferences prefs;

    private SessionStore(SharedPreferences prefs) {
        this.prefs = prefs;
    }

    public static synchronized SessionStore get(Context ctx) {
        if (instance == null) {
            instance = new SessionStore(open(ctx.getApplicationContext()));
        }
        return instance;
    }

    private static SharedPreferences open(Context app) {
        try {
            return create(app);
        } catch (Exception first) {
            // Keystore/prefs corruption: wipe and retry once.
            try {
                app.deleteSharedPreferences("echo_session");
                return create(app);
            } catch (Exception second) {
                throw new IllegalStateException("secure storage unavailable");
            }
        }
    }

    private static SharedPreferences create(Context app) throws Exception {
        String key = MasterKeys.getOrCreate(MasterKeys.AES256_GCM_SPEC);
        return EncryptedSharedPreferences.create("echo_session", key, app,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM);
    }

    public synchronized void saveSession(String uid, String refreshToken, String apiKey, String projectId) {
        prefs.edit().putString("uid", uid).putString("refreshToken", refreshToken)
            .putString("apiKey", apiKey).putString("projectId", projectId)
            .remove("idToken").remove("idTokenExpiresAtMs").apply();
    }

    /** Clears the session and token cache; keeps UI prefs (pinned, tab, batteryPrompted). */
    public synchronized void clearSession() {
        prefs.edit().remove("uid").remove("refreshToken").remove("apiKey").remove("projectId")
            .remove("idToken").remove("idTokenExpiresAtMs").apply();
    }

    public synchronized boolean hasSession() {
        return getUid() != null && getRefreshToken() != null && getApiKey() != null && getProjectId() != null;
    }

    public String getUid() { return prefs.getString("uid", null); }
    public String getRefreshToken() { return prefs.getString("refreshToken", null); }
    public String getApiKey() { return prefs.getString("apiKey", null); }
    public String getProjectId() { return prefs.getString("projectId", null); }

    public synchronized void saveTokens(String idToken, long expiresAtMs, String refreshToken) {
        SharedPreferences.Editor e = prefs.edit().putString("idToken", idToken).putLong("idTokenExpiresAtMs", expiresAtMs);
        if (refreshToken != null && !refreshToken.isEmpty()) e.putString("refreshToken", refreshToken);
        e.apply();
    }

    public String getIdToken() { return prefs.getString("idToken", null); }
    public long getIdTokenExpiresAtMs() { return prefs.getLong("idTokenExpiresAtMs", 0L); }

    public boolean isPinned() { return prefs.getBoolean("pinned", false); }
    public void setPinned(boolean v) { prefs.edit().putBoolean("pinned", v).apply(); }

    public String getTab() {
        String t = prefs.getString("tab", TAB_REMINDERS);
        return TAB_GOALS.equals(t) ? TAB_GOALS : TAB_REMINDERS;
    }

    public void setTab(String tab) {
        prefs.edit().putString("tab", TAB_GOALS.equals(tab) ? TAB_GOALS : TAB_REMINDERS).apply();
    }

    public boolean isBatteryPrompted() { return prefs.getBoolean("batteryPrompted", false); }
    public void setBatteryPrompted(boolean v) { prefs.edit().putBoolean("batteryPrompted", v).apply(); }
}
