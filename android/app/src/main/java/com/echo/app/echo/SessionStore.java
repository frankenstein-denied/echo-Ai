package com.echo.app.echo;

import android.content.Context;
import android.content.SharedPreferences;
import androidx.security.crypto.EncryptedSharedPreferences;
import androidx.security.crypto.MasterKeys;

/** Encrypted storage for the native session and notification prefs. Never log values. */
public final class SessionStore {
    public static final String TAB_REMINDERS = "reminders";
    public static final String TAB_GOALS = "goals";
    public static final String TAB_NOTES = "notes";

    private static SessionStore instance;
    private final SharedPreferences prefs;

    SessionStore(SharedPreferences prefs) {
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

    /** Saves the session. A different user than the last one starts with no check-in state, removed bubble included. */
    public synchronized void saveSession(String uid, String refreshToken, String apiKey, String projectId) {
        SharedPreferences.Editor e = prefs.edit();
        // A session saved by an older APK has a uid but no lastUid.
        String lastUid = prefs.getString("lastUid", getUid());
        if (lastUid != null && !lastUid.equals(uid)) removeCheckInState(e).remove("bubbleRemoved");
        e.putString("uid", uid).putString("lastUid", uid).putString("refreshToken", refreshToken)
            .putString("apiKey", apiKey).putString("projectId", projectId)
            .remove("idToken").remove("idTokenExpiresAtMs").apply();
    }

    /**
     * Real sign-out: clears the session, token cache and check-in state. Keeps UI prefs (pinned, tab,
     * batteryPrompted) and bubbleRemoved, so a removed bubble stays gone if the same user signs back in.
     */
    public synchronized void clearSession() {
        removeCheckInState(removeAuth(prefs.edit())).apply();
    }

    /** The token was rejected, not a sign-out: the next app open restores the session, so check-in state stays. */
    public synchronized void clearAuth() {
        removeAuth(prefs.edit()).apply();
    }

    private SharedPreferences.Editor removeAuth(SharedPreferences.Editor e) {
        String uid = getUid();
        if (uid != null) e.putString("lastUid", uid); // survives, so saveSession can spot a different user
        return e.remove("uid").remove("refreshToken").remove("apiKey").remove("projectId")
            .remove("idToken").remove("idTokenExpiresAtMs");
    }

    private static SharedPreferences.Editor removeCheckInState(SharedPreferences.Editor e) {
        return e.remove("lastFiredMs").remove("lastTopic").remove("unreadCount")
            .remove("pendingCheckInId").remove("pendingCheckInText").remove("cachedPrefsJson")
            .remove("lastBubbleError").remove("lastWakeSource").remove("lastWakeResult").remove("lastWakeMs")
            .remove("nextWakeMs");
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
        return validTab(t);
    }

    public void setTab(String tab) {
        prefs.edit().putString("tab", validTab(tab)).apply();
    }

    private static String validTab(String tab) {
        if (TAB_GOALS.equals(tab)) return TAB_GOALS;
        if (TAB_NOTES.equals(tab)) return TAB_NOTES;
        return TAB_REMINDERS;
    }

    public boolean isBatteryPrompted() { return prefs.getBoolean("batteryPrompted", false); }
    public void setBatteryPrompted(boolean v) { prefs.edit().putBoolean("batteryPrompted", v).apply(); }

    public long getLastFiredMs() { return prefs.getLong("lastFiredMs", 0L); }
    public void setLastFiredMs(long v) { prefs.edit().putLong("lastFiredMs", v).apply(); }

    public String getLastTopic() { return prefs.getString("lastTopic", null); }
    public void setLastTopic(String v) { prefs.edit().putString("lastTopic", v).apply(); }

    public int getUnreadCount() { return prefs.getInt("unreadCount", 0); }
    public void setUnreadCount(int v) { prefs.edit().putInt("unreadCount", v).apply(); }

    public boolean isBubbleRemoved() { return prefs.getBoolean("bubbleRemoved", false); }
    public void setBubbleRemoved(boolean v) { prefs.edit().putBoolean("bubbleRemoved", v).apply(); }

    public String getPendingCheckInId() { return prefs.getString("pendingCheckInId", null); }
    public void setPendingCheckInId(String v) { prefs.edit().putString("pendingCheckInId", v).apply(); }

    public String getPendingCheckInText() { return prefs.getString("pendingCheckInText", null); }
    public void setPendingCheckInText(String v) { prefs.edit().putString("pendingCheckInText", v).apply(); }

    /** Why the bubble last failed to start, shown in Settings. Null once a head is on screen. */
    public String getLastBubbleError() { return prefs.getString("lastBubbleError", null); }
    public void setLastBubbleError(String v) { prefs.edit().putString("lastBubbleError", v).apply(); }

    /** What the last background run did, shown in Settings. Kept in parts, because the day shown depends on when it is read. */
    public String getLastWakeSource() { return prefs.getString("lastWakeSource", null); }
    public String getLastWakeResult() { return prefs.getString("lastWakeResult", null); }
    public long getLastWakeMs() { return prefs.getLong("lastWakeMs", 0L); }
    public void setLastWake(String source, String result, long atMs) {
        prefs.edit().putString("lastWakeSource", source).putString("lastWakeResult", result)
            .putLong("lastWakeMs", atMs).apply();
    }

    /** When the next check-in alarm is set for, shown in Settings. 0 with none set. */
    public long getNextWakeMs() { return prefs.getLong("nextWakeMs", 0L); }
    public void setNextWakeMs(long v) { prefs.edit().putLong("nextWakeMs", v).apply(); }

    public String getCachedPrefsJson() { return prefs.getString("cachedPrefsJson", null); }
    public void setCachedPrefsJson(String v) { prefs.edit().putString("cachedPrefsJson", v).apply(); }
}
