package com.echo.app.echo;

import static org.junit.Assert.*;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
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
}
