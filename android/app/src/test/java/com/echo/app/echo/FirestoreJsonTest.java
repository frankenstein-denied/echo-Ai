package com.echo.app.echo;

import static org.junit.Assert.*;

import com.echo.app.floating.TodaySnapshot;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TimeZone;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

public class FirestoreJsonTest {
    private static final String REMINDERS = "{\"documents\":["
        + "{\"name\":\"projects/p/databases/(default)/documents/users/u/reminders/r1\",\"fields\":{"
        + "\"title\":{\"stringValue\":\"Call mom\"},\"dueAt\":{\"timestampValue\":\"2026-11-05T10:00:00Z\"},\"done\":{\"booleanValue\":false}}},"
        + "{\"name\":\"projects/p/databases/(default)/documents/users/u/reminders/r2\",\"fields\":{"
        + "\"title\":{\"stringValue\":\"Old\"},\"dueAt\":{\"timestampValue\":\"2026-11-05T09:00:00.500Z\"},\"done\":{\"booleanValue\":true}}},"
        + "{\"name\":\"projects/p/databases/(default)/documents/users/u/reminders/r3\",\"fields\":{}}"
        + "]}";

    @Test public void parseRemindersReadsFieldsAndId() {
        List<Reminder> l = FirestoreJson.parseReminders(REMINDERS);
        assertEquals(3, l.size());
        assertEquals("r1", l.get(0).id);
        assertEquals("Call mom", l.get(0).title);
        assertEquals(1793872800000L, l.get(0).dueAtMs);
        assertFalse(l.get(0).done);
        assertTrue(l.get(1).done);
        assertEquals(1793869200500L, l.get(1).dueAtMs);
    }

    @Test public void parseRemindersMissingFieldsGetDefaults() {
        Reminder r = FirestoreJson.parseReminders(REMINDERS).get(2);
        assertEquals("r3", r.id);
        assertEquals("", r.title);
        assertEquals(Long.MAX_VALUE, r.dueAtMs);
        assertFalse(r.done);
    }

    @Test public void emptyAndGarbageResponses() {
        assertTrue(FirestoreJson.parseReminders("{}").isEmpty());
        assertTrue(FirestoreJson.parseGoals("{}").isEmpty());
        assertTrue(FirestoreJson.parseReminders("not json").isEmpty());
        assertTrue(FirestoreJson.parseGoals(null).isEmpty());
    }

    @Test public void parseGoalsHandlesIntegerAndDoubleProgress() {
        String json = "{\"documents\":["
            + "{\"name\":\"x/goals/g1\",\"fields\":{\"title\":{\"stringValue\":\"A\"},\"progress\":{\"integerValue\":\"40\"},\"updatedAt\":{\"timestampValue\":\"2026-11-05T00:00:00Z\"}}},"
            + "{\"name\":\"x/goals/g2\",\"fields\":{\"title\":{\"stringValue\":\"B\"},\"progress\":{\"doubleValue\":62.5}}}]}";
        List<Goal> g = FirestoreJson.parseGoals(json);
        assertEquals("g1", g.get(0).id);
        assertEquals(40.0, g.get(0).progress, 0.001);
        assertEquals(1793836800000L, g.get(0).updatedAtMs);
        assertEquals(62.5, g.get(1).progress, 0.001);
        assertEquals(0L, g.get(1).updatedAtMs);
    }

    @Test public void pickNextRemindersFiltersDoneSortsAndLimits() {
        List<Reminder> in = new ArrayList<>();
        in.add(new Reminder("a", "a", 500, false));
        in.add(new Reminder("b", "b", 100, false));
        in.add(new Reminder("c", "c", 50, true));
        in.add(new Reminder("d", "d", 300, false));
        in.add(new Reminder("e", "e", 200, false));
        List<Reminder> out = FirestoreJson.pickNextReminders(in, 3);
        assertEquals(3, out.size());
        assertEquals("b", out.get(0).id);
        assertEquals("e", out.get(1).id);
        assertEquals("d", out.get(2).id);
    }

    @Test public void pickTopGoalsSortsByUpdatedDesc() {
        List<Goal> in = new ArrayList<>();
        in.add(new Goal("a", "a", 1, 10));
        in.add(new Goal("b", "b", 1, 40));
        in.add(new Goal("c", "c", 1, 30));
        in.add(new Goal("d", "d", 1, 20));
        List<Goal> out = FirestoreJson.pickTopGoals(in, 3);
        assertEquals(3, out.size());
        assertEquals("b", out.get(0).id);
        assertEquals("c", out.get(1).id);
        assertEquals("d", out.get(2).id);
    }

    @Test public void commitBodyShape() throws Exception {
        Map<String, Object> f = new LinkedHashMap<>();
        f.put("done", true);
        f.put("dueAt", 1793872800000L);
        String doc = "projects/p/databases/(default)/documents/users/u/reminders/r1";
        JSONObject w = new JSONObject(FirestoreJson.buildUpdateCommit(doc, f)).getJSONArray("writes").getJSONObject(0);
        JSONObject upd = w.getJSONObject("update");
        assertEquals(doc, upd.getString("name"));
        assertTrue(upd.getJSONObject("fields").getJSONObject("done").getBoolean("booleanValue"));
        assertEquals("2026-11-05T10:00:00Z", upd.getJSONObject("fields").getJSONObject("dueAt").getString("timestampValue"));
        JSONArray mask = w.getJSONObject("updateMask").getJSONArray("fieldPaths");
        assertEquals(2, mask.length());
        assertEquals("done", mask.getString(0));
        assertEquals("dueAt", mask.getString(1));
        JSONObject t = w.getJSONArray("updateTransforms").getJSONObject(0);
        assertEquals("updatedAt", t.getString("fieldPath"));
        assertEquals("REQUEST_TIME", t.getString("setToServerValue"));
        assertTrue(w.getJSONObject("currentDocument").getBoolean("exists"));
        assertFalse(upd.getJSONObject("fields").has("updatedAt"));
    }

    private static final String RQ = "[{\"document\":{\"name\":\"projects/p/databases/(default)/documents/users/u/reminders/q1\",\"fields\":{"
        + "\"title\":{\"stringValue\":\"Pay rent\"},\"dueAt\":{\"timestampValue\":\"2026-11-05T10:00:00Z\"},\"done\":{\"booleanValue\":false}}},\"readTime\":\"t\"},"
        + "{\"document\":{\"name\":\"projects/p/databases/(default)/documents/users/u/reminders/q2\",\"fields\":{}},\"readTime\":\"t\"}]";

    @Test public void parseRemindersRunQueryReadsDocuments() {
        List<Reminder> l = FirestoreJson.parseRemindersRunQuery(RQ);
        assertEquals(2, l.size());
        assertEquals("q1", l.get(0).id);
        assertEquals("Pay rent", l.get(0).title);
        assertEquals(1793872800000L, l.get(0).dueAtMs);
        assertFalse(l.get(0).done);
    }

    @Test public void parseRemindersRunQueryEmptyResultHasNoDocument() {
        assertTrue(FirestoreJson.parseRemindersRunQuery("[{\"readTime\":\"2026-11-05T10:00:00Z\"}]").isEmpty());
        assertTrue(FirestoreJson.parseRemindersRunQuery("[]").isEmpty());
    }

    @Test public void parseRemindersRunQueryMissingFieldsAndBadInput() {
        Reminder r = FirestoreJson.parseRemindersRunQuery(RQ).get(1);
        assertEquals("q2", r.id);
        assertEquals("", r.title);
        assertEquals(Long.MAX_VALUE, r.dueAtMs);
        assertTrue(FirestoreJson.parseRemindersRunQuery(null).isEmpty());
        assertTrue(FirestoreJson.parseRemindersRunQuery("{\"error\":{}}").isEmpty());
    }

    @Test public void remindersQueryBodyFiltersOpenAndLimits() throws Exception {
        JSONObject q = new JSONObject(FirestoreJson.remindersQueryBody()).getJSONObject("structuredQuery");
        assertEquals("reminders", q.getJSONArray("from").getJSONObject(0).getString("collectionId"));
        JSONObject f = q.getJSONObject("where").getJSONObject("fieldFilter");
        assertEquals("done", f.getJSONObject("field").getString("fieldPath"));
        assertEquals("EQUAL", f.getString("op"));
        assertFalse(f.getJSONObject("value").getBoolean("booleanValue"));
        assertEquals(100, q.getInt("limit"));
        assertFalse(q.has("orderBy"));
    }

    private static final String NOTES = "{\"documents\":["
        + "{\"name\":\"projects/p/databases/(default)/documents/users/u/notes/n1\",\"fields\":{"
        + "\"title\":{\"stringValue\":\"Ideas\"},\"body\":{\"stringValue\":\"Line one\"},"
        + "\"updatedAt\":{\"timestampValue\":\"2026-11-05T10:00:00Z\"}}},"
        + "{\"name\":\"projects/p/databases/(default)/documents/users/u/notes/n2\",\"fields\":{}}"
        + "]}";

    @Test public void parseNotesReadsFieldsAndKeepsServerOrder() {
        List<Note> l = FirestoreJson.parseNotes(NOTES);
        assertEquals(2, l.size());
        assertEquals("n1", l.get(0).id);
        assertEquals("Ideas", l.get(0).title);
        assertEquals("Line one", l.get(0).body);
        assertEquals("n2", l.get(1).id);
        assertEquals("", l.get(1).title);
        assertEquals("", l.get(1).body);
    }

    @Test public void parseNotesHandlesEmptyAndBadJson() {
        assertTrue(FirestoreJson.parseNotes("{}").isEmpty());
        assertTrue(FirestoreJson.parseNotes("not json").isEmpty());
        assertTrue(FirestoreJson.parseNotes(null).isEmpty());
    }

    @Test public void latestNotesQueryAsksServerForNewestFirst() {
        assertEquals("?pageSize=3&orderBy=updatedAt%20desc", FirestoreJson.latestNotesQuery(3));
    }

    private static String profile(String fields) {
        return "{\"name\":\"projects/p/databases/(default)/documents/users/u\",\"fields\":{" + fields + "}}";
    }

    @Test public void profileDefaultsAndOnboardingNo() {
        CheckInPrefs p = FirestoreJson.parseProfile("{\"fields\":{}}");
        assertTrue(p.enabled);
        assertEquals(120, p.everyMinutes);
        assertEquals(22 * 60, p.sleepStartMin);
        assertEquals(7 * 60, p.sleepEndMin);
        assertEquals(8, p.waterGoal);
        assertTrue(p.caloriesEnabled);
        assertNull(p.calorieGoal);
        assertFalse(FirestoreJson.parseProfile("{\"fields\":{\"remindersEnabled\":{\"booleanValue\":false}}}").enabled);
    }

    @Test public void profileExplicitSwitchBeatsOnboardingAnswer() {
        assertTrue(FirestoreJson.parseProfile(profile(
            "\"remindersEnabled\":{\"booleanValue\":false},\"checkInsEnabled\":{\"booleanValue\":true}")).enabled);
        assertFalse(FirestoreJson.parseProfile(profile(
            "\"remindersEnabled\":{\"booleanValue\":true},\"checkInsEnabled\":{\"booleanValue\":false}")).enabled);
        assertFalse(FirestoreJson.parseProfile(profile(
            "\"remindersEnabled\":{\"booleanValue\":false},\"checkInsEnabled\":{\"stringValue\":\"yes\"}")).enabled);
    }

    @Test public void profileReadsStoredValues() {
        CheckInPrefs p = FirestoreJson.parseProfile(profile(
            "\"checkInEveryMinutes\":{\"integerValue\":\"30\"},\"sleepStart\":{\"stringValue\":\"23:15\"},"
            + "\"sleepEnd\":{\"stringValue\":\"06:05\"},\"waterGoal\":{\"integerValue\":\"12\"},"
            + "\"caloriesEnabled\":{\"booleanValue\":false},\"calorieGoal\":{\"integerValue\":\"1800\"}"));
        assertEquals(30, p.everyMinutes);
        assertEquals(23 * 60 + 15, p.sleepStartMin);
        assertEquals(6 * 60 + 5, p.sleepEndMin);
        assertEquals(12, p.waterGoal);
        assertFalse(p.caloriesEnabled);
        assertEquals(Integer.valueOf(1800), p.calorieGoal);
    }

    private static int gapOf(String value) {
        return FirestoreJson.parseProfile(profile("\"checkInEveryMinutes\":" + value)).everyMinutes;
    }

    @Test public void profileTakesAnyWholeGapInRange() {
        assertEquals(5, gapOf("{\"integerValue\":\"5\"}"));
        assertEquals(45, gapOf("{\"integerValue\":\"45\"}"));
        assertEquals(2880, gapOf("{\"integerValue\":\"2880\"}"));
        assertEquals(43200, gapOf("{\"integerValue\":\"43200\"}"));
    }

    @Test public void profileGapOutOfRangeOrNotWholeFallsBack() {
        assertEquals(120, gapOf("{\"integerValue\":\"0\"}"));
        assertEquals(120, gapOf("{\"integerValue\":\"0\"}"));
        assertEquals(120, gapOf("{\"integerValue\":\"-30\"}"));
        assertEquals(120, gapOf("{\"integerValue\":\"43201\"}"));
        assertEquals(120, gapOf("{\"doubleValue\":45.5}"));
    }

    @Test public void profileBadStoredValuesFallBack() {
        CheckInPrefs p = FirestoreJson.parseProfile(profile(
            "\"checkInEveryMinutes\":{\"integerValue\":\"0\"},\"sleepStart\":{\"stringValue\":\"24:00\"},"
            + "\"sleepEnd\":{\"stringValue\":\"7:00\"},\"waterGoal\":{\"integerValue\":\"31\"},"
            + "\"calorieGoal\":{\"stringValue\":\"1800\"}"));
        assertEquals(120, p.everyMinutes);
        assertEquals(22 * 60, p.sleepStartMin);
        assertEquals(7 * 60, p.sleepEndMin);
        assertEquals(8, p.waterGoal);
        assertNull(p.calorieGoal);
        assertEquals(8, FirestoreJson.parseProfile(profile("\"waterGoal\":{\"integerValue\":\"0\"}")).waterGoal);
        assertEquals(8, FirestoreJson.parseProfile(profile("\"waterGoal\":{\"doubleValue\":2.5}")).waterGoal);
        assertEquals(8, FirestoreJson.parseProfile(profile("\"waterGoal\":{\"stringValue\":\"9\"}")).waterGoal);
        assertEquals(120, FirestoreJson.parseProfile(profile("\"checkInEveryMinutes\":{\"stringValue\":\"60\"}")).everyMinutes);
    }

    @Test public void profileReadsOnboarded() {
        assertTrue(FirestoreJson.parseProfile(profile("\"onboarded\":{\"booleanValue\":true}")).onboarded);
        assertFalse(FirestoreJson.parseProfile(profile("\"onboarded\":{\"booleanValue\":false}")).onboarded);
        assertFalse(FirestoreJson.parseProfile("{\"fields\":{}}").onboarded);
    }

    @Test public void profileUnreadableDocReadsAsDefaults() {
        assertTrue(FirestoreJson.parseProfile(null).enabled);
        assertEquals(120, FirestoreJson.parseProfile("not json").everyMinutes);
    }

    @Test public void prefsDefaultsMatchTheWeb() {
        CheckInPrefs p = CheckInPrefs.defaults();
        assertTrue(p.enabled);
        assertEquals(120, p.everyMinutes);
        assertEquals(1320, p.sleepStartMin);
        assertEquals(420, p.sleepEndMin);
        assertEquals(8, p.waterGoal);
        assertTrue(p.caloriesEnabled);
        assertNull(p.calorieGoal);
    }

    @Test public void oldHealthLogWithOnlyMoodCounts() {
        TodaySnapshot s = new TodaySnapshot();
        FirestoreJson.applyHealthLog("{\"fields\":{\"mood\":{\"integerValue\":\"7\"}}}", s);
        assertTrue(s.moodLogged);
        assertNull(s.moodTag);
        assertFalse(s.energyLogged);
        assertEquals(0, s.waterGlasses);
    }

    @Test public void healthLogReadsEverything() {
        TodaySnapshot s = new TodaySnapshot();
        FirestoreJson.applyHealthLog("{\"fields\":{\"moodTag\":{\"stringValue\":\"happy\"},"
            + "\"energy\":{\"stringValue\":\"low\"},\"waterGlasses\":{\"integerValue\":\"3\"}}}", s);
        assertTrue(s.moodLogged);
        assertEquals("happy", s.moodTag);
        assertTrue(s.energyLogged);
        assertEquals("low", s.energy);
        assertEquals(3, s.waterGlasses);
    }

    @Test public void emptyHealthLogLogsNothing() {
        TodaySnapshot s = new TodaySnapshot();
        FirestoreJson.applyHealthLog("{\"fields\":{\"waterGlasses\":{\"integerValue\":\"0\"}}}", s);
        assertFalse(s.moodLogged);
        assertFalse(s.energyLogged);
        assertNull(s.energy);
        FirestoreJson.applyHealthLog(null, s);
        assertFalse(s.moodLogged);
    }

    @Test public void mealsAddUpAndLowercaseTheirTypes() {
        TodaySnapshot s = new TodaySnapshot();
        FirestoreJson.applyMeals("[{\"document\":{\"name\":\"x/meals/m1\",\"fields\":{"
            + "\"mealType\":{\"stringValue\":\"breakfast\"},\"totalCalories\":{\"integerValue\":\"350\"}}},\"readTime\":\"t\"},"
            + "{\"document\":{\"name\":\"x/meals/m2\",\"fields\":{"
            + "\"mealType\":{\"stringValue\":\"Lunch\"},\"totalCalories\":{\"integerValue\":\"190\"}}},\"readTime\":\"t\"}]", s);
        assertEquals(540, s.kcalToday);
        assertEquals(2, s.mealTypes.size());
        assertTrue(s.mealTypes.contains("breakfast"));
        assertTrue(s.mealTypes.contains("lunch"));
    }

    @Test public void mealsKeepTheirFoodAndTimeOldestFirst() {
        TodaySnapshot s = new TodaySnapshot();
        FirestoreJson.applyMeals("[{\"document\":{\"name\":\"x/meals/m1\",\"fields\":{"
            + "\"mealType\":{\"stringValue\":\"Lunch\"},\"description\":{\"stringValue\":\"adobo\"},"
            + "\"createdAt\":{\"timestampValue\":\"2026-11-09T04:30:00Z\"}}},\"readTime\":\"t\"},"
            + "{\"document\":{\"name\":\"x/meals/m2\",\"fields\":{"
            + "\"mealType\":{\"stringValue\":\"snack\"},\"description\":{\"stringValue\":\" siopao \"},"
            + "\"createdAt\":{\"timestampValue\":\"2026-11-09T00:05:00Z\"}}},\"readTime\":\"t\"}]", s);
        assertEquals(2, s.meals.size());
        assertEquals("siopao", s.meals.get(0).food);
        assertEquals("snack", s.meals.get(0).type);
        assertEquals(1794182700000L, s.meals.get(0).atMs);
        assertEquals("lunch", s.meals.get(1).type);
    }

    @Test public void pageMessagesCarryTheirTime() {
        List<ChatLine> lines = FirestoreJson.parsePageMessages("[{\"document\":{\"name\":\"p/messages/a\",\"fields\":{"
            + "\"role\":{\"stringValue\":\"user\"},\"text\":{\"stringValue\":\"I ate siopao\"},"
            + "\"createdAt\":{\"timestampValue\":\"2026-11-09T00:04:00Z\"}}},\"readTime\":\"t\"},"
            + "{\"document\":{\"name\":\"p/messages/b\",\"fields\":{"
            + "\"role\":{\"stringValue\":\"assistant\"},\"text\":{\"stringValue\":\"Yum\"}}},\"readTime\":\"t\"}]");
        assertEquals(2, lines.size());
        assertEquals(0L, lines.get(0).atMs); // the query gives newest first; parsing reverses it
        assertEquals(1794182640000L, lines.get(1).atMs);
        assertTrue(lines.get(1).fromUser);
    }

    @Test public void noMealsLeavesAnEmptySet() {
        TodaySnapshot s = new TodaySnapshot();
        s.mealTypes = null;
        FirestoreJson.applyMeals("[{\"readTime\":\"t\"}]", s);
        assertEquals(0, s.kcalToday);
        assertNotNull(s.mealTypes);
        assertTrue(s.mealTypes.isEmpty());
    }

    @Test public void mealsQueryAsksForOneDay() throws Exception {
        JSONObject q = new JSONObject(FirestoreJson.mealsQuery("2026-11-06")).getJSONObject("structuredQuery");
        assertEquals("meals", q.getJSONArray("from").getJSONObject(0).getString("collectionId"));
        JSONObject f = q.getJSONObject("where").getJSONObject("fieldFilter");
        assertEquals("date", f.getJSONObject("field").getString("fieldPath"));
        assertEquals("EQUAL", f.getString("op"));
        assertEquals("2026-11-06", f.getJSONObject("value").getString("stringValue"));
    }

    private static final String PAGE = "projects/p/databases/(default)/documents/users/u/diaryPages/pg";
    private static final String MESSAGE = PAGE + "/messages/m1";

    private static void assertTransforms(JSONObject write, String... fields) throws Exception {
        JSONArray t = write.getJSONArray("updateTransforms");
        assertEquals(fields.length, t.length());
        for (int i = 0; i < fields.length; i++) {
            assertEquals(fields[i], t.getJSONObject(i).getString("fieldPath"));
            assertEquals("REQUEST_TIME", t.getJSONObject(i).getString("setToServerValue"));
        }
    }

    @Test public void checkInCommitLeavesPreviewAlone() throws Exception {
        JSONArray writes = new JSONObject(FirestoreJson.buildCheckInCommit(PAGE, MESSAGE, "Had lunch yet?", null))
            .getJSONArray("writes");
        assertEquals(2, writes.length());

        JSONObject message = writes.getJSONObject(0);
        assertEquals(MESSAGE, message.getJSONObject("update").getString("name"));
        JSONObject f = message.getJSONObject("update").getJSONObject("fields");
        assertEquals(4, f.length());
        assertEquals("assistant", f.getJSONObject("role").getString("stringValue"));
        assertEquals("Had lunch yet?", f.getJSONObject("text").getString("stringValue"));
        assertEquals("general", f.getJSONObject("category").getString("stringValue"));
        assertTrue(f.getJSONObject("checkIn").getBoolean("booleanValue"));
        assertTransforms(message, "createdAt");
        assertFalse(message.getJSONObject("currentDocument").getBoolean("exists"));
        assertFalse(message.has("updateMask"));

        JSONObject page = writes.getJSONObject(1);
        assertEquals(PAGE, page.getJSONObject("update").getString("name"));
        assertEquals(0, page.getJSONObject("update").getJSONObject("fields").length());
        assertEquals(0, page.getJSONObject("updateMask").getJSONArray("fieldPaths").length());
        assertTransforms(page, "updatedAt");
        assertTrue(page.getJSONObject("currentDocument").getBoolean("exists"));
        assertFalse(page.toString().contains("preview"));
        assertFalse(page.toString().contains("messageCount"));
        assertFalse(page.toString().contains("lastMessageAt"));
    }

    @Test public void checkInCommitCreatesPageWhenNeeded() throws Exception {
        JSONArray writes = new JSONObject(FirestoreJson.buildCheckInCommit(PAGE, MESSAGE, "Hi", "Fri, Nov 6"))
            .getJSONArray("writes");
        assertEquals(2, writes.length());
        assertEquals(MESSAGE, writes.getJSONObject(0).getJSONObject("update").getString("name"));

        JSONObject page = writes.getJSONObject(1);
        assertEquals(PAGE, page.getJSONObject("update").getString("name"));
        JSONObject f = page.getJSONObject("update").getJSONObject("fields");
        assertEquals(3, f.length());
        assertEquals("Fri, Nov 6", f.getJSONObject("title").getString("stringValue"));
        assertEquals("", f.getJSONObject("preview").getString("stringValue"));
        assertEquals("0", f.getJSONObject("messageCount").getString("integerValue"));
        assertFalse(page.getJSONObject("currentDocument").getBoolean("exists"));
        assertFalse(page.has("updateMask"));
        assertTransforms(page, "createdAt", "updatedAt", "lastMessageAt");
    }

    private static String pageEntry(String id, String createdAt) {
        String created = createdAt == null ? "" : "\"createdAt\":{\"timestampValue\":\"" + createdAt + "\"}";
        return "{\"document\":{\"name\":\"x/diaryPages/" + id + "\",\"fields\":{" + created + "}},\"readTime\":\"t\"}";
    }

    private static final TimeZone MANILA = TimeZone.getTimeZone("GMT+08:00");
    private static final long NOV_6_10AM_MANILA = 1793930400000L; // 2026-11-06T02:00:00Z

    @Test public void pickTodayPageUsesLocalDay() {
        assertEquals("2026-11-06T02:00:00Z", FirestoreJson.toRfc3339(NOV_6_10AM_MANILA));
        // 23:30 and 00:30 local time: either side of midnight in UTC+8, but the same day in UTC.
        String json = "[" + pageEntry("yesterday", "2026-11-05T15:30:00Z") + ","
            + pageEntry("today", "2026-11-05T16:30:00Z") + "]";
        assertEquals("today", FirestoreJson.pickTodayPageId(json, NOV_6_10AM_MANILA, MANILA));
    }

    @Test public void pickTodayPageTakesTheFirstMatch() {
        String json = "[" + pageEntry("newest", "2026-11-06T00:30:00Z") + ","
            + pageEntry("older", "2026-11-06T01:00:00Z") + "]";
        assertEquals("newest", FirestoreJson.pickTodayPageId(json, NOV_6_10AM_MANILA, MANILA));
    }

    @Test public void pickTodayPageIsNullWhenNoneFits() {
        assertNull(FirestoreJson.pickTodayPageId("[" + pageEntry("yesterday", "2026-11-05T15:30:00Z") + "]", NOV_6_10AM_MANILA, MANILA));
        assertNull(FirestoreJson.pickTodayPageId("[" + pageEntry("undated", null) + "]", NOV_6_10AM_MANILA, MANILA));
        assertNull(FirestoreJson.pickTodayPageId("[{\"readTime\":\"t\"}]", NOV_6_10AM_MANILA, MANILA));
        assertNull(FirestoreJson.pickTodayPageId(null, NOV_6_10AM_MANILA, MANILA));
    }

    @Test public void todaysPageQueryListsNewestUpdatedFirst() throws Exception {
        JSONObject q = new JSONObject(FirestoreJson.todaysPageQuery()).getJSONObject("structuredQuery");
        assertEquals("diaryPages", q.getJSONArray("from").getJSONObject(0).getString("collectionId"));
        JSONObject order = q.getJSONArray("orderBy").getJSONObject(0);
        assertEquals("updatedAt", order.getJSONObject("field").getString("fieldPath"));
        assertEquals("DESCENDING", order.getString("direction"));
        assertTrue(q.getInt("limit") > 0);
        assertFalse(q.has("where"));
    }

    @Test public void dateKeyAndPageTitleUseLocalTime() {
        long lateNov5Utc = NOV_6_10AM_MANILA - 9 * 3_600_000L - 30 * 60_000L;
        assertEquals("2026-11-05T16:30:00Z", FirestoreJson.toRfc3339(lateNov5Utc));
        assertEquals("2026-11-06", FirestoreJson.dateKey(lateNov5Utc, MANILA));
        assertEquals("2026-11-05", FirestoreJson.dateKey(lateNov5Utc, TimeZone.getTimeZone("UTC")));
        assertEquals("Fri, Nov 6", FirestoreJson.pageTitle(lateNov5Utc, MANILA));
    }

    private static TodaySnapshot snapshot(String dateKey, long fetchedAtMs) {
        TodaySnapshot s = new TodaySnapshot();
        s.dateKey = dateKey;
        s.fetchedAtMs = fetchedAtMs;
        return s;
    }

    @Test public void freshSnapshotFromTodayIsUsable() {
        long now = NOV_6_10AM_MANILA;
        assertTrue(FirestoreJson.snapshotIsUsable(snapshot("2026-11-06", now - 119 * 60_000L), "2026-11-06", now));
    }

    @Test public void snapshotFromYesterdayIsNotUsable() {
        long now = NOV_6_10AM_MANILA;
        TodaySnapshot s = snapshot("2026-11-06", now - 10 * 60_000L);
        assertFalse(FirestoreJson.snapshotIsUsable(s, "2026-11-07", now));
    }

    @Test public void snapshotOlderThanTwoHoursIsNotUsable() {
        long now = NOV_6_10AM_MANILA;
        assertFalse(FirestoreJson.snapshotIsUsable(snapshot("2026-11-06", now - 121 * 60_000L), "2026-11-06", now));
        assertFalse(FirestoreJson.snapshotIsUsable(snapshot("2026-11-06", now - 120 * 60_000L), "2026-11-06", now));
    }

    @Test public void missingSnapshotIsNotUsable() {
        assertFalse(FirestoreJson.snapshotIsUsable(null, "2026-11-06", NOV_6_10AM_MANILA));
    }

    @Test public void profileNameIsTrimmedAndBlankMeansNone() {
        assertEquals("Sam", FirestoreJson.parseProfile("{\"fields\":{\"preferredName\":{\"stringValue\":\" Sam \"}}}").preferredName);
        assertNull(FirestoreJson.parseProfile("{\"fields\":{\"preferredName\":{\"stringValue\":\"  \"}}}").preferredName);
        assertNull(FirestoreJson.parseProfile("{\"fields\":{}}").preferredName);
    }

    @Test public void profileLanguageIsReadAndBlankMeansNone() {
        assertEquals("fil", FirestoreJson.parseProfile("{\"fields\":{\"language\":{\"stringValue\":\"fil\"}}}").language);
        assertNull(FirestoreJson.parseProfile("{\"fields\":{\"language\":{\"stringValue\":\" \"}}}").language);
        assertNull(FirestoreJson.parseProfile("{\"fields\":{}}").language);
    }
}
