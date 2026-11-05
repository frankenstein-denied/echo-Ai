package com.echo.app.echo;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TimeZone;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/** Pure helpers for Firestore REST JSON. No Android dependencies. */
public final class FirestoreJson {
    private FirestoreJson() {}

    public static List<Reminder> parseReminders(String listJson) {
        List<Reminder> out = new ArrayList<>();
        JSONArray docs = documents(listJson);
        for (int i = 0; i < docs.length(); i++) {
            JSONObject d = docs.optJSONObject(i);
            if (d == null) continue;
            JSONObject f = d.optJSONObject("fields");
            out.add(new Reminder(
                idOf(d),
                pickString(f, "title", ""),
                pickTimestampMs(f, "dueAt", Long.MAX_VALUE),
                pickBool(f, "done", false)));
        }
        return out;
    }

    /** Request body for :runQuery: open reminders only (equality filter, no index needed), at most 100. */
    public static String remindersQueryBody() {
        try {
            JSONObject filter = new JSONObject()
                .put("field", new JSONObject().put("fieldPath", "done"))
                .put("op", "EQUAL")
                .put("value", new JSONObject().put("booleanValue", false));
            JSONObject q = new JSONObject()
                .put("from", new JSONArray().put(new JSONObject().put("collectionId", "reminders")))
                .put("where", new JSONObject().put("fieldFilter", filter))
                .put("limit", 100);
            return new JSONObject().put("structuredQuery", q).toString();
        } catch (JSONException e) {
            throw new IllegalStateException(e);
        }
    }

    /** Parses a :runQuery response (JSON array of {document, readTime}); entries without a document are skipped. */
    public static List<Reminder> parseRemindersRunQuery(String json) {
        List<Reminder> out = new ArrayList<>();
        if (json == null) return out;
        JSONArray arr;
        try {
            arr = new JSONArray(json);
        } catch (JSONException e) {
            return out;
        }
        for (int i = 0; i < arr.length(); i++) {
            JSONObject entry = arr.optJSONObject(i);
            JSONObject d = entry == null ? null : entry.optJSONObject("document");
            if (d == null) continue;
            JSONObject f = d.optJSONObject("fields");
            out.add(new Reminder(
                idOf(d),
                pickString(f, "title", ""),
                pickTimestampMs(f, "dueAt", Long.MAX_VALUE),
                pickBool(f, "done", false)));
        }
        return out;
    }

    public static List<Goal> parseGoals(String listJson) {
        List<Goal> out = new ArrayList<>();
        JSONArray docs = documents(listJson);
        for (int i = 0; i < docs.length(); i++) {
            JSONObject d = docs.optJSONObject(i);
            if (d == null) continue;
            JSONObject f = d.optJSONObject("fields");
            out.add(new Goal(
                idOf(d),
                pickString(f, "title", ""),
                pickNumber(f, "progress", 0),
                pickTimestampMs(f, "updatedAt", 0L)));
        }
        return out;
    }

    /** Notes in the order the server returned them (see {@link #latestNotesQuery}). */
    public static List<Note> parseNotes(String listJson) {
        List<Note> out = new ArrayList<>();
        JSONArray docs = documents(listJson);
        for (int i = 0; i < docs.length(); i++) {
            JSONObject d = docs.optJSONObject(i);
            if (d == null) continue;
            JSONObject f = d.optJSONObject("fields");
            out.add(new Note(idOf(d), pickString(f, "title", ""), pickString(f, "body", "")));
        }
        return out;
    }

    /** List query for the newest notes. Sorted by the server: bodies can be large and there may be hundreds. */
    public static String latestNotesQuery(int max) {
        return "?pageSize=" + max + "&orderBy=updatedAt%20desc";
    }

    public static List<Reminder> pickNextReminders(List<Reminder> all, int max) {
        List<Reminder> open = new ArrayList<>();
        for (Reminder r : all) if (!r.done) open.add(r);
        Collections.sort(open, new Comparator<Reminder>() {
            @Override public int compare(Reminder a, Reminder b) {
                return Long.compare(a.dueAtMs, b.dueAtMs);
            }
        });
        return open.subList(0, Math.min(max, open.size()));
    }

    public static List<Goal> pickTopGoals(List<Goal> all, int max) {
        List<Goal> copy = new ArrayList<>(all);
        Collections.sort(copy, new Comparator<Goal>() {
            @Override public int compare(Goal a, Goal b) {
                return Long.compare(b.updatedAtMs, a.updatedAtMs);
            }
        });
        return copy.subList(0, Math.min(max, copy.size()));
    }

    /**
     * Body for documents:commit with one update write. Field values: Boolean, String,
     * or Long (epoch ms, sent as a timestamp). updatedAt is always set to REQUEST_TIME.
     */
    public static String buildUpdateCommit(String docPath, Map<String, Object> fields) {
        try {
            JSONObject values = new JSONObject();
            JSONArray mask = new JSONArray();
            for (Map.Entry<String, Object> e : fields.entrySet()) {
                Object v = e.getValue();
                JSONObject val = new JSONObject();
                if (v instanceof Boolean) val.put("booleanValue", ((Boolean) v).booleanValue());
                else if (v instanceof Long) val.put("timestampValue", toRfc3339(((Long) v).longValue()));
                else if (v instanceof String) val.put("stringValue", (String) v);
                else throw new IllegalArgumentException("unsupported field type: " + e.getKey());
                values.put(e.getKey(), val);
                mask.put(e.getKey());
            }
            JSONObject write = new JSONObject();
            write.put("update", new JSONObject().put("name", docPath).put("fields", values));
            write.put("updateMask", new JSONObject().put("fieldPaths", mask));
            write.put("updateTransforms", new JSONArray().put(new JSONObject()
                .put("fieldPath", "updatedAt").put("setToServerValue", "REQUEST_TIME")));
            write.put("currentDocument", new JSONObject().put("exists", true));
            return new JSONObject().put("writes", new JSONArray().put(write)).toString();
        } catch (JSONException ex) {
            throw new IllegalStateException(ex);
        }
    }

    public static String toRfc3339(long ms) {
        SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US);
        f.setTimeZone(TimeZone.getTimeZone("UTC"));
        return f.format(new Date(ms));
    }

    public static String pickString(JSONObject fields, String key, String def) {
        JSONObject v = value(fields, key);
        return v != null && v.has("stringValue") ? v.optString("stringValue", def) : def;
    }

    public static boolean pickBool(JSONObject fields, String key, boolean def) {
        JSONObject v = value(fields, key);
        return v != null && v.has("booleanValue") ? v.optBoolean("booleanValue", def) : def;
    }

    public static double pickNumber(JSONObject fields, String key, double def) {
        JSONObject v = value(fields, key);
        if (v == null) return def;
        if (v.has("doubleValue")) return v.optDouble("doubleValue", def);
        if (v.has("integerValue")) return v.optDouble("integerValue", def); // string or number
        return def;
    }

    public static long pickTimestampMs(JSONObject fields, String key, long def) {
        JSONObject v = value(fields, key);
        if (v == null || !v.has("timestampValue")) return def;
        long ms = parseRfc3339(v.optString("timestampValue", ""));
        return ms == Long.MIN_VALUE ? def : ms;
    }

    /** Parses RFC 3339 UTC like 2026-11-05T10:00:00Z or ...:00.123456789Z. Returns Long.MIN_VALUE on failure. */
    static long parseRfc3339(String s) {
        try {
            if (s.length() < 20 || !s.endsWith("Z")) return Long.MIN_VALUE;
            long ms = 0;
            String base = s.substring(0, 19);
            String frac = s.substring(19, s.length() - 1);
            if (frac.startsWith(".") && frac.length() > 1) {
                String digits = (frac.substring(1) + "000").substring(0, 3);
                ms = Integer.parseInt(digits);
            } else if (frac.length() > 0) {
                return Long.MIN_VALUE;
            }
            SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US);
            f.setTimeZone(TimeZone.getTimeZone("UTC"));
            return f.parse(base).getTime() + ms;
        } catch (Exception e) {
            return Long.MIN_VALUE;
        }
    }

    private static JSONObject value(JSONObject fields, String key) {
        return fields == null ? null : fields.optJSONObject(key);
    }

    private static String idOf(JSONObject doc) {
        String name = doc.optString("name", "");
        return name.substring(name.lastIndexOf('/') + 1);
    }

    private static JSONArray documents(String json) {
        if (json == null) return new JSONArray();
        try {
            JSONArray a = new JSONObject(json).optJSONArray("documents");
            return a == null ? new JSONArray() : a;
        } catch (JSONException e) {
            return new JSONArray();
        }
    }
}
