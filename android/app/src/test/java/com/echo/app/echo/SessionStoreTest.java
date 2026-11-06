package com.echo.app.echo;

import static org.junit.Assert.*;

import android.content.SharedPreferences;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import org.junit.Before;
import org.junit.Test;

public class SessionStoreTest {
    /** Just enough SharedPreferences: edits land on apply or commit. */
    private static final class FakePrefs implements SharedPreferences {
        final Map<String, Object> values = new HashMap<>();

        @Override public Map<String, ?> getAll() { return values; }
        @Override public String getString(String k, String d) { return values.containsKey(k) ? (String) values.get(k) : d; }
        @Override public Set<String> getStringSet(String k, Set<String> d) { throw new UnsupportedOperationException(); }
        @Override public int getInt(String k, int d) { return values.containsKey(k) ? (Integer) values.get(k) : d; }
        @Override public long getLong(String k, long d) { return values.containsKey(k) ? (Long) values.get(k) : d; }
        @Override public float getFloat(String k, float d) { throw new UnsupportedOperationException(); }
        @Override public boolean getBoolean(String k, boolean d) { return values.containsKey(k) ? (Boolean) values.get(k) : d; }
        @Override public boolean contains(String k) { return values.containsKey(k); }
        @Override public void registerOnSharedPreferenceChangeListener(OnSharedPreferenceChangeListener l) {}
        @Override public void unregisterOnSharedPreferenceChangeListener(OnSharedPreferenceChangeListener l) {}

        @Override public Editor edit() {
            return new Editor() {
                final Map<String, Object> edits = new LinkedHashMap<>();

                @Override public Editor putString(String k, String v) { edits.put(k, v); return this; }
                @Override public Editor putStringSet(String k, Set<String> v) { throw new UnsupportedOperationException(); }
                @Override public Editor putInt(String k, int v) { edits.put(k, v); return this; }
                @Override public Editor putLong(String k, long v) { edits.put(k, v); return this; }
                @Override public Editor putFloat(String k, float v) { throw new UnsupportedOperationException(); }
                @Override public Editor putBoolean(String k, boolean v) { edits.put(k, v); return this; }
                @Override public Editor remove(String k) { edits.put(k, null); return this; }
                @Override public Editor clear() { throw new UnsupportedOperationException(); }
                @Override public boolean commit() { apply(); return true; }
                @Override public void apply() {
                    for (Map.Entry<String, Object> e : edits.entrySet()) {
                        if (e.getValue() == null) values.remove(e.getKey());
                        else values.put(e.getKey(), e.getValue());
                    }
                }
            };
        }
    }

    private FakePrefs prefs;
    private SessionStore store;

    @Before public void setUp() {
        prefs = new FakePrefs();
        store = new SessionStore(prefs);
    }

    private void signIn(String uid) {
        store.saveSession(uid, "refresh", "key", "project");
    }

    private void fillCheckInState() {
        store.setLastFiredMs(5L);
        store.setLastTopic("MOOD");
        store.setUnreadCount(2);
        store.setQuietUnread(1);
        store.setBubbleRemoved(true);
        store.setPendingCheckInId("m1");
        store.setPendingCheckInText("Had lunch yet?");
        store.setCachedPrefsJson("{}");
    }

    private void assertCheckInStateKept() {
        assertEquals(5L, store.getLastFiredMs());
        assertEquals("MOOD", store.getLastTopic());
        assertEquals(2, store.getUnreadCount());
        assertEquals(1, store.getQuietUnread());
        assertTrue(store.isBubbleRemoved());
        assertEquals("m1", store.getPendingCheckInId());
        assertEquals("Had lunch yet?", store.getPendingCheckInText());
        assertEquals("{}", store.getCachedPrefsJson());
    }

    private void assertCountersAndCacheCleared() {
        assertEquals(0L, store.getLastFiredMs());
        assertNull(store.getLastTopic());
        assertEquals(0, store.getUnreadCount());
        assertEquals(0, store.getQuietUnread());
        assertNull(store.getPendingCheckInId());
        assertNull(store.getPendingCheckInText());
        assertNull(store.getCachedPrefsJson());
    }

    @Test public void rejectedTokenRemovesAuthOnly() {
        signIn("a");
        fillCheckInState();
        store.clearAuth();
        assertFalse(store.hasSession());
        assertNull(store.getUid());
        assertNull(store.getIdToken());
        assertCheckInStateKept();
    }

    @Test public void sameUserRestoredAfterRejectedTokenKeepsEverything() {
        signIn("a");
        fillCheckInState();
        store.clearAuth();
        signIn("a");
        assertTrue(store.hasSession());
        assertCheckInStateKept();
    }

    @Test public void signOutClearsStateButKeepsTheRemovedBubble() {
        signIn("a");
        fillCheckInState();
        store.clearSession();
        assertFalse(store.hasSession());
        assertCountersAndCacheCleared();
        assertTrue(store.isBubbleRemoved());
    }

    @Test public void sameUserSigningBackInKeepsTheRemovedBubble() {
        signIn("a");
        fillCheckInState();
        store.clearSession();
        signIn("a");
        assertTrue(store.isBubbleRemoved());
    }

    @Test public void differentUserAfterSignOutStartsClean() {
        signIn("a");
        fillCheckInState();
        store.clearSession();
        signIn("b");
        assertFalse(store.isBubbleRemoved());
        assertCountersAndCacheCleared();
    }

    @Test public void differentUserAfterRejectedTokenStartsClean() {
        signIn("a");
        fillCheckInState();
        store.clearAuth();
        signIn("b");
        assertFalse(store.isBubbleRemoved());
        assertCountersAndCacheCleared();
    }

    @Test public void differentUserWithNoSignOutStartsClean() {
        signIn("a");
        fillCheckInState();
        signIn("b");
        assertFalse(store.isBubbleRemoved());
        assertCountersAndCacheCleared();
    }

    @Test public void sameUserSavedAgainKeepsEverything() {
        signIn("a");
        fillCheckInState();
        signIn("a");
        assertCheckInStateKept();
    }

    /** A session saved by an older APK has a uid but no remembered last user. */
    @Test public void upgradedInstallStillKnowsItsUser() {
        prefs.values.put("uid", "a");
        fillCheckInState();
        signIn("a");
        assertCheckInStateKept();
        prefs.values.remove("lastUid");
        prefs.values.put("uid", "a");
        signIn("b");
        assertFalse(store.isBubbleRemoved());
    }

    @Test public void upgradedInstallRejectedBeforeNextSaveStillKnowsItsUser() {
        prefs.values.put("uid", "a");
        prefs.values.put("refreshToken", "r");
        fillCheckInState();
        store.clearAuth();
        signIn("b");
        assertFalse(store.isBubbleRemoved());
        assertCountersAndCacheCleared();
    }
}
