package com.echo.app.floating;

import com.echo.app.echo.Reminder;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.List;
import java.util.TimeZone;

/** Pure choice of what a check-in asks. Fixed templates only: nothing here calls an AI. */
public final class CheckInPlanner {
    public enum Topic { REMINDER, MEAL, WATER, MOOD, ENERGY, CALORIES, OVERVIEW }

    public static final class Plan {
        public final Topic topic;
        public final String shortText;
        public final String fullText;

        Plan(Topic topic, String shortText, String fullText) {
            this.topic = topic;
            this.shortText = shortText;
            this.fullText = fullText;
        }
    }

    private static final long MINUTE_MS = 60_000L;
    private static final int DAY_MINUTES = 24 * 60;
    private static final int TITLE_MAX = 24;
    private static final int BREAKFAST_BY = 10 * 60;
    private static final int LUNCH_BY = 14 * 60;
    private static final int DINNER_BY = 20 * 60;

    private CheckInPlanner() {}

    public static Plan plan(TodaySnapshot s, Topic lastTopic, long nowMs, TimeZone tz,
                            int everyMinutes, int sleepStartMin, int sleepEndMin) {
        int minute = minuteOfDay(nowMs, tz);
        long nextCheckInMs = nextCheckInMs(nowMs, tz, everyMinutes, sleepStartMin, sleepEndMin);
        Reminder soonest = nextReminder(s, nowMs);
        boolean reminderDue = soonest != null && soonest.dueAtMs <= nextCheckInMs;
        String meal = overdueMeal(s, minute);

        List<Topic> missing = new ArrayList<>();
        if (reminderDue) missing.add(Topic.REMINDER);
        if (meal != null) missing.add(Topic.MEAL);
        if (behindOnWater(s, minute, sleepStartMin, sleepEndMin)) missing.add(Topic.WATER);
        if (!s.moodLogged) missing.add(Topic.MOOD);
        if (!s.energyLogged) missing.add(Topic.ENERGY);
        if (nearCalorieGoal(s)) missing.add(Topic.CALORIES);

        Topic topic = pick(missing, lastTopic);
        String overview = overview(s, nowMs, tz);
        switch (topic) {
            case REMINDER: {
                String time = formatTime(soonest.dueAtMs, tz);
                return new Plan(topic, shortTitle(soonest.title) + " at " + time,
                    "Your " + soonest.title + " reminder is at " + time + ". " + overview);
            }
            case MEAL: {
                String question = "Had " + meal + " yet?";
                return new Plan(topic, question, question + " What did you eat? " + overview);
            }
            case WATER:
                return question(topic, "Time for some water?", overview);
            case MOOD:
                return question(topic, "How are you feeling?", overview);
            case ENERGY:
                return question(topic, "How's your energy?", overview);
            case CALORIES: {
                String text = s.kcalToday + " of " + s.calorieGoal + " kcal so far";
                return new Plan(topic, text, text + ". " + overview);
            }
            default: {
                String text = "Here's your day so far";
                return new Plan(topic, text, text + ". " + overview);
            }
        }
    }

    private static Plan question(Topic topic, String text, String overview) {
        return new Plan(topic, text, text + " " + overview);
    }

    /** First missing topic that was not just asked, else the only one left, else the overview. */
    private static Topic pick(List<Topic> missing, Topic lastTopic) {
        for (Topic t : missing) {
            if (t != lastTopic) return t;
        }
        return missing.isEmpty() ? Topic.OVERVIEW : missing.get(0);
    }

    /** Nothing fires in sleep time, so a gap that ends there runs on to the moment sleep ends. */
    private static long nextCheckInMs(long nowMs, TimeZone tz, int everyMinutes,
                                      int sleepStartMin, int sleepEndMin) {
        long next = nowMs + everyMinutes * MINUTE_MS;
        int minute = minuteOfDay(next, tz);
        if (!CheckInRules.inSleep(minute, sleepStartMin, sleepEndMin)) return next;
        return next + floorMod(sleepEndMin - minute) * MINUTE_MS;
    }

    /** The open reminder due soonest from now, skipping past ones and any with no title or date. */
    private static Reminder nextReminder(TodaySnapshot s, long nowMs) {
        Reminder best = null;
        for (Reminder r : s.openReminders) {
            if (r.done || r.dueAtMs < nowMs || r.dueAtMs == Long.MAX_VALUE) continue;
            if (r.title == null || r.title.isEmpty()) continue;
            if (best == null || r.dueAtMs < best.dueAtMs) best = r;
        }
        return best;
    }

    private static String overdueMeal(TodaySnapshot s, int minute) {
        if (!s.caloriesEnabled) return null;
        if (minute >= DINNER_BY && !s.mealTypes.contains("dinner")) return "dinner";
        if (minute >= LUNCH_BY && !s.mealTypes.contains("lunch")) return "lunch";
        if (minute >= BREAKFAST_BY && !s.mealTypes.contains("breakfast")) return "breakfast";
        return null;
    }

    private static boolean behindOnWater(TodaySnapshot s, int minute, int sleepStartMin, int sleepEndMin) {
        // Equal times mean never asleep: the waking day is then the whole calendar day.
        int wakeMin = sleepStartMin == sleepEndMin ? 0 : sleepEndMin;
        int wakingMinutes = sleepStartMin == sleepEndMin ? DAY_MINUTES : floorMod(sleepStartMin - sleepEndMin);
        int minutesSinceWake = Math.min(floorMod(minute - wakeMin), wakingMinutes);
        return s.waterGlasses < s.waterGoal * minutesSinceWake / wakingMinutes;
    }

    private static boolean nearCalorieGoal(TodaySnapshot s) {
        if (!s.caloriesEnabled || s.calorieGoal == null || s.calorieGoal <= 0) return false;
        return s.kcalToday * 100L >= s.calorieGoal * 90L;
    }

    private static String overview(TodaySnapshot s, long nowMs, TimeZone tz) {
        StringBuilder out = new StringBuilder("So far today: ")
            .append(s.waterGlasses).append(" of ").append(s.waterGoal).append(" glasses");
        if (s.caloriesEnabled) out.append(", ").append(s.kcalToday).append(" kcal");
        if (s.moodLogged) out.append(", mood ").append(valueOrLogged(s.moodTag));
        out.append(", energy ").append(s.energyLogged ? valueOrLogged(s.energy) : "not logged").append('.');
        Reminder next = nextReminder(s, nowMs);
        if (next != null && sameDay(next.dueAtMs, nowMs, tz)) {
            out.append(" Next up: ").append(next.title).append(" at ").append(formatTime(next.dueAtMs, tz)).append('.');
        }
        return out.toString();
    }

    private static String valueOrLogged(String value) {
        return value == null || value.isEmpty() ? "logged" : value;
    }

    private static String shortTitle(String title) {
        if (title.length() <= TITLE_MAX) return title;
        int end = Character.isHighSurrogate(title.charAt(TITLE_MAX - 1)) ? TITLE_MAX - 1 : TITLE_MAX;
        return title.substring(0, end) + "…";
    }

    /** {@code 5 PM} or {@code 5:30 PM} on the phone's clock, the same in every locale. */
    private static String formatTime(long ms, TimeZone tz) {
        Calendar c = calendar(ms, tz);
        int hour = c.get(Calendar.HOUR);
        int minute = c.get(Calendar.MINUTE);
        String clock = (hour == 0 ? 12 : hour) + (minute == 0 ? "" : minute < 10 ? ":0" + minute : ":" + minute);
        return clock + (c.get(Calendar.AM_PM) == Calendar.AM ? " AM" : " PM");
    }

    private static boolean sameDay(long aMs, long bMs, TimeZone tz) {
        Calendar a = calendar(aMs, tz);
        Calendar b = calendar(bMs, tz);
        return a.get(Calendar.YEAR) == b.get(Calendar.YEAR)
            && a.get(Calendar.DAY_OF_YEAR) == b.get(Calendar.DAY_OF_YEAR);
    }

    static int minuteOfDay(long ms, TimeZone tz) {
        Calendar c = calendar(ms, tz);
        return c.get(Calendar.HOUR_OF_DAY) * 60 + c.get(Calendar.MINUTE);
    }

    private static Calendar calendar(long ms, TimeZone tz) {
        Calendar c = Calendar.getInstance(tz);
        c.setTimeInMillis(ms);
        return c;
    }

    private static int floorMod(int minutes) {
        return Math.floorMod(minutes, DAY_MINUTES);
    }
}
