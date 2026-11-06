package com.echo.app.echo;

import android.content.Context;
import com.echo.app.floating.TodaySnapshot;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TimeZone;
import java.util.UUID;

/** Blocking Firestore REST client for reminders, goals, notes and check-ins. Call off the main thread. Never throws. */
public final class EchoApi {
    private static final long SNOOZE_MS = 15 * 60 * 1000L;
    /** What {@link #getDoc} returns for a 404, as against null for a failed read. */
    private static final String NOT_FOUND = "";

    private final Context ctx;

    public EchoApi(Context ctx) {
        this.ctx = ctx.getApplicationContext();
    }

    /** Open (not done) reminders, up to 100, or null on failure. Unordered; caller sorts. */
    public List<Reminder> listReminders() {
        String json = runQuery(FirestoreJson.remindersQueryBody());
        return json == null ? null : FirestoreJson.parseRemindersRunQuery(json);
    }

    /** All goals, or null on failure. */
    public List<Goal> listGoals() {
        String json = list("goals", "?pageSize=100");
        return json == null ? null : FirestoreJson.parseGoals(json);
    }

    /** The newest notes, newest first, or null on failure. */
    public List<Note> listNotes(int max) {
        String json = list("notes", FirestoreJson.latestNotesQuery(max));
        return json == null ? null : FirestoreJson.parseNotes(json);
    }

    public boolean markDone(String id) {
        Map<String, Object> f = new LinkedHashMap<>();
        f.put("done", Boolean.TRUE);
        return update(id, f);
    }

    public boolean snooze(String id) {
        Map<String, Object> f = new LinkedHashMap<>();
        f.put("dueAt", Long.valueOf(System.currentTimeMillis() + SNOOZE_MS));
        return update(id, f);
    }

    /** Check-in settings from the profile, or null when the profile cannot be read or does not exist yet. */
    public CheckInPrefs getProfilePrefs() {
        String json = getDoc("");
        return json == null || json.equals(NOT_FOUND) ? null : FirestoreJson.parseProfile(json);
    }

    /** Everything a check-in needs to know about today, or null on a real failure. No health log yet is not one. */
    public TodaySnapshot loadToday(CheckInPrefs p, TimeZone tz) {
        try {
            if (p == null || tz == null) return null;
            long now = System.currentTimeMillis();
            TodaySnapshot snapshot = new TodaySnapshot();
            snapshot.dateKey = FirestoreJson.dateKey(now, tz);
            snapshot.fetchedAtMs = now;
            snapshot.waterGoal = p.waterGoal;
            snapshot.caloriesEnabled = p.caloriesEnabled;
            snapshot.calorieGoal = p.calorieGoal;

            String log = getDoc("/healthLogs/" + snapshot.dateKey);
            if (log == null) return null;
            FirestoreJson.applyHealthLog(log.equals(NOT_FOUND) ? null : log, snapshot);

            if (p.caloriesEnabled) {
                String meals = runQuery(FirestoreJson.mealsQuery(snapshot.dateKey));
                if (meals == null) return null;
                FirestoreJson.applyMeals(meals, snapshot);
            }

            List<Reminder> reminders = listReminders();
            if (reminders == null) return null;
            snapshot.openReminders = reminders;
            return snapshot;
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * Adds a check-in to today's page, creating the page if there is none. Safe to retry with the same id:
     * if an earlier try landed but its reply was lost, the commit is refused and this still returns true.
     */
    public boolean writeCheckIn(String messageId, String text, TimeZone tz) {
        try {
            if (messageId == null || messageId.isEmpty() || messageId.indexOf('/') >= 0) return false;
            if (text == null || text.isEmpty() || tz == null) return false;
            long now = System.currentTimeMillis();
            String pages = runQuery(FirestoreJson.todaysPageQuery());
            if (pages == null) return false;
            String pageId = FirestoreJson.pickTodayPageId(pages, now, tz);
            String newPageTitle = pageId == null ? FirestoreJson.pageTitle(now, tz) : null;
            if (pageId == null) pageId = UUID.randomUUID().toString();

            SessionStore s = SessionStore.get(ctx);
            String pagePath = "/diaryPages/" + pageId;
            String messagePath = pagePath + "/messages/" + messageId;
            String userPath = base(s) + "/users/" + s.getUid();
            String body = FirestoreJson.buildCheckInCommit(userPath + pagePath, userPath + messagePath, text, newPageTitle);
            if (commit(body)) return true;
            String existing = getDoc(messagePath);
            return existing != null && !existing.equals(NOT_FOUND);
        } catch (Exception e) {
            return false;
        }
    }

    private static String base(SessionStore s) {
        return "projects/" + s.getProjectId() + "/databases/(default)/documents";
    }

    private String list(String collection, String query) {
        HttpURLConnection c = null;
        try {
            SessionStore s = SessionStore.get(ctx);
            String token = TokenProvider.getIdToken(ctx);
            if (token == null) return null;
            URL url = new URL("https://firestore.googleapis.com/v1/" + base(s) + "/users/" + s.getUid()
                + "/" + collection + query);
            c = open(url, "GET", token);
            if (c.getResponseCode() != 200) return null;
            return TokenProvider.read(c.getInputStream());
        } catch (Exception e) {
            return null;
        } finally {
            if (c != null) c.disconnect();
        }
    }

    /** One document under the user's own doc: its JSON, {@link #NOT_FOUND} on a 404, or null on failure. */
    private String getDoc(String path) {
        HttpURLConnection c = null;
        try {
            SessionStore s = SessionStore.get(ctx);
            String token = TokenProvider.getIdToken(ctx);
            if (token == null) return null;
            URL url = new URL("https://firestore.googleapis.com/v1/" + base(s) + "/users/" + s.getUid() + path);
            c = open(url, "GET", token);
            int code = c.getResponseCode();
            if (code == 404) return NOT_FOUND;
            return code == 200 ? TokenProvider.read(c.getInputStream()) : null;
        } catch (Exception e) {
            return null;
        } finally {
            if (c != null) c.disconnect();
        }
    }

    /** Runs a query over the user's subcollections: the raw response, or null on failure. */
    private String runQuery(String body) {
        HttpURLConnection c = null;
        try {
            SessionStore s = SessionStore.get(ctx);
            String token = TokenProvider.getIdToken(ctx);
            if (token == null) return null;
            URL url = new URL("https://firestore.googleapis.com/v1/" + base(s) + "/users/" + s.getUid() + ":runQuery");
            c = open(url, "POST", token);
            sendJson(c, body);
            if (c.getResponseCode() != 200) return null;
            return TokenProvider.read(c.getInputStream());
        } catch (Exception e) {
            return null;
        } finally {
            if (c != null) c.disconnect();
        }
    }

    private boolean update(String id, Map<String, Object> fields) {
        try {
            if (id == null || id.isEmpty() || id.indexOf('/') >= 0) return false;
            SessionStore s = SessionStore.get(ctx);
            String docPath = base(s) + "/users/" + s.getUid() + "/reminders/" + id;
            return commit(FirestoreJson.buildUpdateCommit(docPath, fields));
        } catch (Exception e) {
            return false;
        }
    }

    private boolean commit(String body) {
        HttpURLConnection c = null;
        try {
            SessionStore s = SessionStore.get(ctx);
            String token = TokenProvider.getIdToken(ctx);
            if (token == null) return false;
            URL url = new URL("https://firestore.googleapis.com/v1/" + base(s) + ":commit");
            c = open(url, "POST", token);
            sendJson(c, body);
            return c.getResponseCode() == 200;
        } catch (Exception e) {
            return false;
        } finally {
            if (c != null) c.disconnect();
        }
    }

    private static void sendJson(HttpURLConnection c, String body) throws Exception {
        c.setDoOutput(true);
        c.setRequestProperty("Content-Type", "application/json");
        OutputStream os = c.getOutputStream();
        os.write(body.getBytes("UTF-8"));
        os.close();
    }

    private static HttpURLConnection open(URL url, String method, String token) throws Exception {
        HttpURLConnection c = (HttpURLConnection) url.openConnection();
        c.setConnectTimeout(15000);
        c.setReadTimeout(15000);
        c.setRequestMethod(method);
        c.setRequestProperty("Authorization", "Bearer " + token);
        return c;
    }
}
