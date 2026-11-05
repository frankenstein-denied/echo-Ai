package com.echo.app.echo;

import android.content.Context;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Blocking Firestore REST client for reminders and goals. Call off the main thread. Never throws. */
public final class EchoApi {
    private static final long SNOOZE_MS = 15 * 60 * 1000L;

    private final Context ctx;

    public EchoApi(Context ctx) {
        this.ctx = ctx.getApplicationContext();
    }

    /** All reminders, or null on failure. */
    public List<Reminder> listReminders() {
        String json = list("reminders");
        return json == null ? null : FirestoreJson.parseReminders(json);
    }

    /** All goals, or null on failure. */
    public List<Goal> listGoals() {
        String json = list("goals");
        return json == null ? null : FirestoreJson.parseGoals(json);
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

    private static String base(SessionStore s) {
        return "projects/" + s.getProjectId() + "/databases/(default)/documents";
    }

    private String list(String collection) {
        HttpURLConnection c = null;
        try {
            SessionStore s = SessionStore.get(ctx);
            String token = TokenProvider.getIdToken(ctx);
            if (token == null) return null;
            URL url = new URL("https://firestore.googleapis.com/v1/" + base(s) + "/users/" + s.getUid()
                + "/" + collection + "?pageSize=100");
            c = open(url, "GET", token);
            if (c.getResponseCode() != 200) return null;
            return TokenProvider.read(c.getInputStream());
        } catch (Exception e) {
            return null;
        } finally {
            if (c != null) c.disconnect();
        }
    }

    private boolean update(String id, Map<String, Object> fields) {
        HttpURLConnection c = null;
        try {
            if (id == null || id.isEmpty() || id.indexOf('/') >= 0) return false;
            SessionStore s = SessionStore.get(ctx);
            String token = TokenProvider.getIdToken(ctx);
            if (token == null) return false;
            String docPath = base(s) + "/users/" + s.getUid() + "/reminders/" + id;
            byte[] body = FirestoreJson.buildUpdateCommit(docPath, fields).getBytes("UTF-8");
            URL url = new URL("https://firestore.googleapis.com/v1/" + base(s) + ":commit");
            c = open(url, "POST", token);
            c.setDoOutput(true);
            c.setRequestProperty("Content-Type", "application/json");
            OutputStream os = c.getOutputStream();
            os.write(body);
            os.close();
            return c.getResponseCode() == 200;
        } catch (Exception e) {
            return false;
        } finally {
            if (c != null) c.disconnect();
        }
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
