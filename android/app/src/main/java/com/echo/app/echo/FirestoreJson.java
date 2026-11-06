package com.echo.app.echo;

import com.echo.app.floating.TodaySnapshot;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.Date;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TimeZone;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/** Pure helpers for Firestore REST JSON. No Android dependencies. */
public final class FirestoreJson {
    private static final int MIN_CHECK_IN_GAP = 1;
    private static final int MAX_CHECK_IN_GAP = 43200; // 30 days, same limits as firestore.rules
    private static final int MIN_WATER_GOAL = 1;
    private static final int MAX_WATER_GOAL = 30;
    private static final String CLOCK_TIME = "([01][0-9]|2[0-3]):[0-5][0-9]"; // same pattern as firestore.rules
    private static final long SNAPSHOT_MAX_AGE_MS = 2 * 60 * 60 * 1000L;
    private static final int PAGES_TO_SCAN = 50;
    private static final int MEALS_MAX = 100;

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
        for (JSONObject d : runQueryDocs(json)) {
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

    /** Reads the profile the way the web's resolveCheckInSettings does: absent or bad fields fall back to the defaults. */
    public static CheckInPrefs parseProfile(String docJson) {
        JSONObject f = fieldsOf(docJson);
        CheckInPrefs p = CheckInPrefs.defaults();
        p.enabled = pickBool(f, "checkInsEnabled", pickBool(f, "remindersEnabled", true));
        double every = pickNumber(f, "checkInEveryMinutes", p.everyMinutes);
        if (isCheckInGap(every)) p.everyMinutes = (int) every;
        p.sleepStartMin = clockMinutes(pickString(f, "sleepStart", ""), p.sleepStartMin);
        p.sleepEndMin = clockMinutes(pickString(f, "sleepEnd", ""), p.sleepEndMin);
        double water = pickNumber(f, "waterGoal", p.waterGoal);
        if (isWaterGoal(water)) p.waterGoal = (int) water;
        p.caloriesEnabled = pickBool(f, "caloriesEnabled", true);
        double calories = pickNumber(f, "calorieGoal", Double.NaN);
        if (!Double.isNaN(calories)) p.calorieGoal = (int) calories;
        p.onboarded = pickBool(f, "onboarded", false);
        return p;
    }

    public static boolean isCheckInGap(double minutes) {
        return minutes == Math.rint(minutes) && minutes >= MIN_CHECK_IN_GAP && minutes <= MAX_CHECK_IN_GAP;
    }

    static boolean isWaterGoal(double glasses) {
        return glasses == Math.rint(glasses) && glasses >= MIN_WATER_GOAL && glasses <= MAX_WATER_GOAL;
    }

    /** {@code HH:MM} as minutes after midnight, or def if it is not a valid time. */
    static int clockMinutes(String time, int def) {
        if (time == null || !time.matches(CLOCK_TIME)) return def;
        return Integer.parseInt(time.substring(0, 2)) * 60 + Integer.parseInt(time.substring(3));
    }

    /** Copies today's health log into the snapshot. A null doc reads as an empty log. Old logs have a mood score and no tag. */
    public static void applyHealthLog(String docJson, TodaySnapshot s) {
        JSONObject f = fieldsOf(docJson);
        s.waterGlasses = (int) pickNumber(f, "waterGlasses", 0);
        s.moodTag = pickString(f, "moodTag", null);
        s.moodLogged = !Double.isNaN(pickNumber(f, "mood", Double.NaN)) || (s.moodTag != null && !s.moodTag.isEmpty());
        s.energy = pickString(f, "energy", null);
        s.energyLogged = s.energy != null && !s.energy.isEmpty();
    }

    /** Copies today's meals into the snapshot: the total, and which meal types are logged, in lowercase. */
    public static void applyMeals(String runQueryJson, TodaySnapshot s) {
        s.kcalToday = 0;
        s.mealTypes = new HashSet<>();
        for (JSONObject d : runQueryDocs(runQueryJson)) {
            JSONObject f = d.optJSONObject("fields");
            s.kcalToday += (int) Math.round(pickNumber(f, "totalCalories", 0));
            String type = pickString(f, "mealType", "");
            if (!type.isEmpty()) s.mealTypes.add(type.toLowerCase(Locale.ROOT));
        }
    }

    /** Request body for :runQuery: one day's meals (equality filter, no index needed). */
    public static String mealsQuery(String dateKey) {
        try {
            JSONObject filter = new JSONObject()
                .put("field", new JSONObject().put("fieldPath", "date"))
                .put("op", "EQUAL")
                .put("value", stringValue(dateKey));
            JSONObject q = new JSONObject()
                .put("from", new JSONArray().put(new JSONObject().put("collectionId", "meals")))
                .put("where", new JSONObject().put("fieldFilter", filter))
                .put("limit", MEALS_MAX);
            return new JSONObject().put("structuredQuery", q).toString();
        } catch (JSONException e) {
            throw new IllegalStateException(e);
        }
    }

    /** Request body for :runQuery: the most recently updated pages, for {@link #pickTodayPageId}. */
    public static String todaysPageQuery() {
        try {
            JSONObject order = new JSONObject()
                .put("field", new JSONObject().put("fieldPath", "updatedAt"))
                .put("direction", "DESCENDING");
            JSONObject q = new JSONObject()
                .put("from", new JSONArray().put(new JSONObject().put("collectionId", "diaryPages")))
                .put("orderBy", new JSONArray().put(order))
                .put("limit", PAGES_TO_SCAN);
            return new JSONObject().put("structuredQuery", q).toString();
        } catch (JSONException e) {
            throw new IllegalStateException(e);
        }
    }

    /** Same choice as the web's pickTodayPage: the first page, newest update first, created on today's local date. */
    public static String pickTodayPageId(String runQueryJson, long nowMs, TimeZone tz) {
        String today = dateKey(nowMs, tz);
        for (JSONObject d : runQueryDocs(runQueryJson)) {
            long createdMs = pickTimestampMs(d.optJSONObject("fields"), "createdAt", Long.MIN_VALUE);
            if (createdMs != Long.MIN_VALUE && today.equals(dateKey(createdMs, tz))) return idOf(d);
        }
        return null;
    }

    /**
     * Body for documents:commit that adds a check-in message and bumps the page's updatedAt. Pass newPageTitle
     * to create the page too, or null when it exists. preview and messageCount stay as they are, so an
     * unanswered check-in does not change the page in the list. The message is create-only, so a retry
     * with the same id cannot send it twice.
     */
    public static String buildCheckInCommit(String pageDocPath, String messageDocPath, String text, String newPageTitle) {
        try {
            JSONObject messageFields = new JSONObject()
                .put("role", stringValue("assistant"))
                .put("text", stringValue(text))
                .put("category", stringValue("general"))
                .put("checkIn", new JSONObject().put("booleanValue", true));
            JSONObject message = new JSONObject()
                .put("update", new JSONObject().put("name", messageDocPath).put("fields", messageFields))
                .put("updateTransforms", requestTime("createdAt"))
                .put("currentDocument", new JSONObject().put("exists", false));
            JSONObject page = new JSONObject();
            if (newPageTitle == null) {
                page.put("update", new JSONObject().put("name", pageDocPath).put("fields", new JSONObject()));
                // An absent mask would replace the whole page; an empty one changes only the transforms.
                page.put("updateMask", new JSONObject().put("fieldPaths", new JSONArray()));
                page.put("updateTransforms", requestTime("updatedAt"));
                page.put("currentDocument", new JSONObject().put("exists", true));
            } else {
                JSONObject pageFields = new JSONObject()
                    .put("title", stringValue(newPageTitle))
                    .put("preview", stringValue(""))
                    .put("messageCount", new JSONObject().put("integerValue", "0"));
                page.put("update", new JSONObject().put("name", pageDocPath).put("fields", pageFields));
                page.put("updateTransforms", requestTime("createdAt", "updatedAt", "lastMessageAt"));
                page.put("currentDocument", new JSONObject().put("exists", false));
            }
            return new JSONObject().put("writes", new JSONArray().put(message).put(page)).toString();
        } catch (JSONException e) {
            throw new IllegalStateException(e);
        }
    }

    private static JSONObject stringValue(String s) throws JSONException {
        return new JSONObject().put("stringValue", s);
    }

    private static JSONArray requestTime(String... fieldPaths) throws JSONException {
        JSONArray out = new JSONArray();
        for (String path : fieldPaths) {
            out.put(new JSONObject().put("fieldPath", path).put("setToServerValue", "REQUEST_TIME"));
        }
        return out;
    }

    /** True when the snapshot is from today and under 2 hours old. */
    public static boolean snapshotIsUsable(TodaySnapshot s, String todayKey, long nowMs) {
        return s != null && todayKey.equals(s.dateKey) && nowMs - s.fetchedAtMs < SNAPSHOT_MAX_AGE_MS;
    }

    /** Local date as yyyy-MM-dd, the id of that day's health log. */
    public static String dateKey(long ms, TimeZone tz) {
        return format("yyyy-MM-dd", ms, tz);
    }

    /** Default page title like {@code Fri, Nov 6}, matching the web's defaultPageTitle. */
    public static String pageTitle(long ms, TimeZone tz) {
        return format("EEE, MMM d", ms, tz);
    }

    private static String format(String pattern, long ms, TimeZone tz) {
        SimpleDateFormat f = new SimpleDateFormat(pattern, Locale.US);
        f.setTimeZone(tz);
        return f.format(new Date(ms));
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

    /** The fields of one document, or null when it cannot be read. */
    private static JSONObject fieldsOf(String docJson) {
        if (docJson == null) return null;
        try {
            return new JSONObject(docJson).optJSONObject("fields");
        } catch (JSONException e) {
            return null;
        }
    }

    /** The documents in a :runQuery response (JSON array of {document, readTime}), in order. */
    private static List<JSONObject> runQueryDocs(String json) {
        List<JSONObject> out = new ArrayList<>();
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
            if (d != null) out.add(d);
        }
        return out;
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
