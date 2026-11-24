package com.echo.app.floating;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import com.echo.app.floating.CheckInPlanner.Topic;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import org.junit.Test;

public class CheckInAnswerTest {
    private static final long NOW = 1793930400000L;
    private static final long MINUTE = 60_000L;

    private static List<String> labels(Topic topic) {
        List<String> out = new ArrayList<>();
        for (CheckInAnswer.Option o : CheckInAnswer.options(topic)) out.add(o.label);
        return out;
    }

    @Test public void answersPerTopicAreExactlyTheSpecs() {
        assertEquals(Arrays.asList("😄", "🙂", "😐", "😔", "😣"), labels(Topic.MOOD));
        assertEquals(Arrays.asList("+1 glass", "+2", "Later"), labels(Topic.WATER));
        assertEquals(Arrays.asList("Done", "Snooze 30 min", "Tell Echo"), labels(Topic.REMINDER));
        assertEquals(Arrays.asList("Yes, I ate", "Not yet", "Skipping", "Tell Echo"), labels(Topic.MEAL));
        for (Topic t : new Topic[] {Topic.MORNING, Topic.NIGHT, Topic.CALORIES, Topic.OVERVIEW}) {
            assertEquals(t.name(), Arrays.asList("Tell Echo", "Later"), labels(t));
        }
    }

    @Test public void everyTopicHasAtMostFiveAnswers() {
        for (Topic t : Topic.values()) {
            assertTrue(t.name(), CheckInAnswer.options(t).size() <= 5);
            assertFalse(t.name(), CheckInAnswer.options(t).isEmpty());
        }
    }

    @Test public void moodFacesSaveTheWebsMoodTagsAndScores() {
        String[] tags = {"great", "happy", "okay", "sad", "anxious"};
        int[] scores = {9, 8, 6, 3, 3}; // MOOD_SCORES in lib/echo/health-helpers.ts
        for (int face = 1; face <= 5; face++) {
            CheckInAnswer.Save s = CheckInAnswer.save(Topic.MOOD, "mood_" + face, NOW, 0L, null);
            assertNotNull(s);
            assertEquals(tags[face - 1], s.moodTag);
            assertEquals(Integer.valueOf(scores[face - 1]), s.mood);
            assertEquals(0, s.waterDelta);
            assertFalse(s.reminderDone);
            assertEquals("health", s.category);
            assertTrue(s.answerText.startsWith(CheckInAnswer.options(Topic.MOOD).get(face - 1).label));
        }
        assertNull(CheckInAnswer.save(Topic.MOOD, "mood_6", NOW, 0L, null));
        assertNull(CheckInAnswer.save(Topic.MOOD, "mood_0", NOW, 0L, null));
    }

    @Test public void waterAddsGlasses() {
        CheckInAnswer.Save one = CheckInAnswer.save(Topic.WATER, "water_1", NOW, 0L, null);
        CheckInAnswer.Save two = CheckInAnswer.save(Topic.WATER, "water_2", NOW, 0L, null);
        assertEquals(1, one.waterDelta);
        assertEquals(2, two.waterDelta);
        assertNull(one.mood);
        assertNull(one.moodTag);
        assertEquals("health", one.category);
    }

    @Test public void reminderDoneMarksItDone() {
        CheckInAnswer.Save s = CheckInAnswer.save(Topic.REMINDER, "done", NOW, NOW + 50 * MINUTE, null);
        assertTrue(s.reminderDone);
        assertEquals(0L, s.reminderDueAtMs);
        assertEquals("reminder", s.category);
    }

    @Test public void reminderSnoozeMovesItThirtyMinutesLater() {
        CheckInAnswer.Save s = CheckInAnswer.save(Topic.REMINDER, "snooze", NOW, NOW + 50 * MINUTE, null);
        assertFalse(s.reminderDone);
        assertEquals(NOW + 80 * MINUTE, s.reminderDueAtMs);
    }

    @Test public void snoozingAReminderThatIsAlreadyDueCountsFromNow() {
        CheckInAnswer.Save s = CheckInAnswer.save(Topic.REMINDER, "snooze", NOW, NOW - 5 * MINUTE, null);
        assertEquals(NOW + 30 * MINUTE, s.reminderDueAtMs);
    }

    @Test public void yesIAteAndTellEchoOpenTheChatWithNoWrite() {
        assertEquals(CheckInAnswer.Kind.OPEN_CHAT, CheckInAnswer.find(Topic.MEAL, "ate").kind);
        assertNull(CheckInAnswer.save(Topic.MEAL, "ate", NOW, 0L, "lunch"));
        for (Topic t : new Topic[] {Topic.REMINDER, Topic.MEAL, Topic.MORNING, Topic.NIGHT, Topic.CALORIES, Topic.OVERVIEW}) {
            assertEquals(t.name(), CheckInAnswer.Kind.OPEN_CHAT, CheckInAnswer.find(t, "tell").kind);
            assertNull(t.name(), CheckInAnswer.save(t, "tell", NOW, 0L, null));
        }
    }

    @Test public void laterWritesNothing() {
        assertEquals(CheckInAnswer.Kind.LATER, CheckInAnswer.find(Topic.WATER, "later").kind);
        assertNull(CheckInAnswer.save(Topic.WATER, "later", NOW, 0L, null));
        assertNull(CheckInAnswer.save(Topic.OVERVIEW, "later", NOW, 0L, null));
    }

    @Test public void notYetAndSkippingGoOnTheDiaryPageOnly() {
        CheckInAnswer.Save notYet = CheckInAnswer.save(Topic.MEAL, "not_yet", NOW, 0L, "lunch");
        assertEquals("Not yet", notYet.answerText);
        assertNull(notYet.mood);
        assertEquals(0, notYet.waterDelta);
        assertFalse(notYet.reminderDone);
        assertEquals(0L, notYet.reminderDueAtMs);
        assertNull(notYet.skippedMeal);

        CheckInAnswer.Save skip = CheckInAnswer.save(Topic.MEAL, "skip", NOW, 0L, "lunch");
        assertEquals("Skipping lunch", skip.answerText);
        assertEquals("lunch", skip.skippedMeal);
        assertNull(skip.mood);
        assertEquals(0, skip.waterDelta);
    }

    @Test public void anAnswerFromAnotherTopicIsRefused() {
        assertNull(CheckInAnswer.find(Topic.WATER, "done"));
        assertNull(CheckInAnswer.save(Topic.WATER, "mood_1", NOW, 0L, null));
        assertNull(CheckInAnswer.save(Topic.MOOD, "water_1", NOW, 0L, null));
        assertNull(CheckInAnswer.find(Topic.MOOD, null));
        assertNull(CheckInAnswer.find(null, "later"));
    }

    @Test public void everySaveSaysWhatWasSaved() {
        for (Topic t : Topic.values()) {
            for (CheckInAnswer.Option o : CheckInAnswer.options(t)) {
                CheckInAnswer.Save s = CheckInAnswer.save(t, o.code, NOW, NOW + MINUTE, "lunch");
                assertEquals(t + "/" + o.code, o.kind == CheckInAnswer.Kind.SAVE, s != null);
                if (s == null) continue;
                assertFalse(s.answerText.isEmpty());
                assertTrue(s.savedLine.startsWith("Saved") || s.savedLine.startsWith("Snoozed"));
            }
        }
    }

    @Test public void theAnswerIdComesFromTheCheckInSoARetryCannotWriteTwice() {
        String id = "checkin-2026-11-06-abc";
        assertEquals(CheckInAnswer.answerId(id), CheckInAnswer.answerId(id));
        assertEquals("checkin-2026-11-06-abc-answer", CheckInAnswer.answerId(id));
        assertNull(CheckInAnswer.answerId(null));
        assertNull(CheckInAnswer.answerId("a/b"));
    }

    @Test public void theMealAskedFollowsTheTimeItWasAsked() {
        assertEquals("breakfast", CheckInAnswer.mealAt(8 * 60));
        assertEquals("lunch", CheckInAnswer.mealAt(13 * 60));
        assertEquals("dinner", CheckInAnswer.mealAt(19 * 60));
        assertNull(CheckInAnswer.mealAt(11 * 60 + 30));
    }
}
