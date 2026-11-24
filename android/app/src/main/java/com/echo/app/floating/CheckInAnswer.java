package com.echo.app.floating;

import com.echo.app.floating.CheckInPlanner.Topic;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Pure: the one-tap answers each check-in offers, and what a tapped answer writes. Simple taps are saved by
 * the phone; anything with words (Yes I ate, Tell Echo) opens the chat so Echo files it.
 */
public final class CheckInAnswer {
    public enum Kind {
        /** Saved straight away by the phone, with the question and answer on today's page. */
        SAVE,
        /** Opens the chathead chat with the question there, for an answer in words. */
        OPEN_CHAT,
        /** Nothing to save; the check-in just goes away. */
        LATER
    }

    public static final class Option {
        public final String code;
        public final String label;
        public final Kind kind;

        Option(String code, String label, Kind kind) {
            this.code = code;
            this.label = label;
            this.kind = kind;
        }
    }

    /** What one SAVE answer writes. Null fields and zeros mean "leave as it is". */
    public static final class Save {
        /** The user's message on today's page. */
        public final String answerText;
        /** The message category, one firestore.rules allows. */
        public final String category;
        /** The short confirmation shown after it saved. */
        public final String savedLine;
        public final Integer mood;
        public final String moodTag;
        public final int waterDelta;
        public final boolean reminderDone;
        /** The reminder's new due time, or 0 to leave it. */
        public final long reminderDueAtMs;
        /** The meal skipped today, so Echo doesn't ask about it again. */
        public final String skippedMeal;

        Save(String answerText, String category, String savedLine, Integer mood, String moodTag, int waterDelta,
             boolean reminderDone, long reminderDueAtMs, String skippedMeal) {
            this.answerText = answerText;
            this.category = category;
            this.savedLine = savedLine;
            this.mood = mood;
            this.moodTag = moodTag;
            this.waterDelta = waterDelta;
            this.reminderDone = reminderDone;
            this.reminderDueAtMs = reminderDueAtMs;
            this.skippedMeal = skippedMeal;
        }

        public boolean writesHealth() {
            return moodTag != null || waterDelta != 0;
        }

        public boolean writesReminder() {
            return reminderDone || reminderDueAtMs > 0;
        }
    }

    public static final String TELL = "tell";
    public static final String LATER = "later";
    static final String DONE = "done";
    static final String SNOOZE = "snooze";
    static final String ATE = "ate";
    static final String NOT_YET = "not_yet";
    static final String SKIP = "skip";
    static final String WATER_1 = "water_1";
    static final String WATER_2 = "water_2";
    static final String MOOD_PREFIX = "mood_";

    static final long SNOOZE_MS = 30 * 60_000L;
    private static final String ANSWER_SUFFIX = "-answer";

    /** Left to right as the mockup draws them, with the web's mood tags and scores (lib/echo/health-helpers.ts). */
    private static final String[] FACES = {"😄", "🙂", "😐", "😔", "😣"};
    private static final String[] FACE_TAGS = {"great", "happy", "okay", "sad", "anxious"};
    private static final String[] FACE_NAMES = {"Great", "Happy", "Okay", "Sad", "Stressed"};
    private static final int[] FACE_SCORES = {9, 8, 6, 3, 3};

    private CheckInAnswer() {}

    /** The answers a check-in on this topic offers, in order. Never empty, at most 5. */
    public static List<Option> options(Topic topic) {
        List<Option> out = new ArrayList<>();
        if (topic == null) return out;
        switch (topic) {
            case MOOD:
                for (int i = 0; i < FACES.length; i++) out.add(new Option(MOOD_PREFIX + (i + 1), FACES[i], Kind.SAVE));
                break;
            case WATER:
                out.add(new Option(WATER_1, "+1 glass", Kind.SAVE));
                out.add(new Option(WATER_2, "+2", Kind.SAVE));
                out.add(new Option(LATER, "Later", Kind.LATER));
                break;
            case REMINDER:
                out.add(new Option(DONE, "Done", Kind.SAVE));
                out.add(new Option(SNOOZE, "Snooze 30 min", Kind.SAVE));
                out.add(new Option(TELL, "Tell Echo", Kind.OPEN_CHAT));
                break;
            case MEAL:
                out.add(new Option(ATE, "Yes, I ate", Kind.OPEN_CHAT));
                out.add(new Option(NOT_YET, "Not yet", Kind.SAVE));
                out.add(new Option(SKIP, "Skipping", Kind.SAVE));
                out.add(new Option(TELL, "Tell Echo", Kind.OPEN_CHAT));
                break;
            default: // MORNING, NIGHT, CALORIES, OVERVIEW
                out.add(new Option(TELL, "Tell Echo", Kind.OPEN_CHAT));
                out.add(new Option(LATER, "Later", Kind.LATER));
                break;
        }
        return Collections.unmodifiableList(out);
    }

    /** A mood face, drawn larger than a word answer. */
    static boolean isFace(Option o) {
        return o.code.startsWith(MOOD_PREFIX);
    }

    /** The answer with this code on this topic, or null when the topic doesn't offer it. */
    public static Option find(Topic topic, String code) {
        if (topic == null || code == null) return null;
        for (Option o : options(topic)) if (o.code.equals(code)) return o;
        return null;
    }

    /**
     * What a SAVE answer writes, or null for any other answer (or one this topic doesn't offer).
     * reminderDueAtMs is the reminder's current due time; meal is the meal that was asked about, or null.
     */
    public static Save save(Topic topic, String code, long nowMs, long reminderDueAtMs, String meal) {
        Option o = find(topic, code);
        if (o == null || o.kind != Kind.SAVE) return null;
        if (code.startsWith(MOOD_PREFIX)) {
            int face = Integer.parseInt(code.substring(MOOD_PREFIX.length())) - 1;
            return new Save(FACES[face] + " " + FACE_NAMES[face], "health", "Saved: mood " + FACES[face],
                FACE_SCORES[face], FACE_TAGS[face], 0, false, 0L, null);
        }
        switch (code) {
            case WATER_1:
                return new Save("+1 glass of water", "health", "Saved: +1 glass of water", null, null, 1, false, 0L, null);
            case WATER_2:
                return new Save("+2 glasses of water", "health", "Saved: +2 glasses of water", null, null, 2, false, 0L, null);
            case DONE:
                return new Save("Done ✓", "reminder", "Saved: reminder done", null, null, 0, true, 0L, null);
            case SNOOZE:
                return new Save("Snooze 30 min", "reminder", "Snoozed for 30 min", null, null, 0, false,
                    Math.max(reminderDueAtMs, nowMs) + SNOOZE_MS, null);
            case NOT_YET:
                return new Save("Not yet", "health", "Saved: not yet", null, null, 0, false, 0L, null);
            case SKIP: {
                String what = meal == null ? "this meal" : meal;
                return new Save("Skipping " + what, "health", "Saved: skipping " + what, null, null, 0, false, 0L, meal);
            }
            default:
                return null;
        }
    }

    /**
     * The answer's message id on the page, made from the check-in's id. The message is create-only, so the
     * same answer sent twice (a double tap, a retry after a lost reply) can only land once. Null for a bad id.
     */
    public static String answerId(String checkInId) {
        if (checkInId == null || checkInId.isEmpty() || checkInId.indexOf('/') >= 0) return null;
        return checkInId + ANSWER_SUFFIX;
    }

    /** The meal a check-in asked about at this minute of the day, or null between the meal windows. */
    public static String mealAt(int minuteOfDay) {
        return CheckInPlanner.mealNow(minuteOfDay);
    }
}
