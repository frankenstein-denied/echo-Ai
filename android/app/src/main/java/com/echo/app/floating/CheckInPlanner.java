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
    private static final int SHORT_MAX = 40;
    private static final int BREAKFAST_FROM = 7 * 60;
    private static final int BREAKFAST_UNTIL = 11 * 60;
    private static final int LUNCH_FROM = 12 * 60;
    private static final int LUNCH_UNTIL = 17 * 60;
    private static final int DINNER_FROM = 18 * 60; // runs until sleep, and nothing fires in sleep time
    private static final int AFTERNOON_FROM = 12 * 60;
    private static final int EVENING_FROM = 18 * 60;

    private CheckInPlanner() {}

    public static Plan plan(TodaySnapshot s, Topic lastTopic, long nowMs, TimeZone tz,
                            int everyMinutes, int sleepStartMin, int sleepEndMin) {
        int minute = minuteOfDay(nowMs, tz);
        long nextCheckInMs = nextCheckInMs(nowMs, tz, everyMinutes, sleepStartMin, sleepEndMin);
        Reminder soonest = nextReminder(s, nowMs);
        boolean reminderDue = soonest != null && soonest.dueAtMs <= nextCheckInMs;
        String meal = mealToAsk(s, minute);

        List<Topic> missing = new ArrayList<>();
        if (reminderDue) missing.add(Topic.REMINDER);
        if (meal != null) missing.add(Topic.MEAL);
        if (behindOnWater(s, minute, sleepStartMin, sleepEndMin)) missing.add(Topic.WATER);
        if (!s.moodLogged) missing.add(Topic.MOOD);
        if (!s.energyLogged) missing.add(Topic.ENERGY);
        if (nearCalorieGoal(s)) missing.add(Topic.CALORIES);

        Topic topic = pick(missing, lastTopic);
        String overview = overview(s, nowMs, tz);
        String hello = greeting(minute);
        switch (topic) {
            case REMINDER: {
                String time = formatTime(soonest.dueAtMs, tz);
                return new Plan(topic, shortTitle(soonest.title) + " at " + time,
                    hello + " Your " + soonest.title + " reminder is at " + time + ". " + overview);
            }
            case MEAL: {
                String question = "Had " + meal + " yet?";
                return new Plan(topic, question, hello + " " + question + " What did you eat? " + overview);
            }
            case WATER:
                return question(topic, hello, "Time for some water?", overview);
            case MOOD:
                return question(topic, hello, "How are you feeling?", overview);
            case ENERGY:
                return question(topic, hello, "How's your energy?", overview);
            case CALORIES: {
                String text = s.kcalToday + " of " + s.calorieGoal + " kcal so far";
                return new Plan(topic, text, hello + " " + text + ". " + overview);
            }
            default: {
                String text = "Here's your day so far";
                String greeted = hello + " " + text;
                return new Plan(topic, greeted.length() <= SHORT_MAX ? greeted : text, greeted + ". " + overview);
            }
        }
    }

    private static Plan question(Topic topic, String hello, String text, String overview) {
        return new Plan(topic, text, hello + " " + text + " " + overview);
    }

    private static String greeting(int minute) {
        if (minute < AFTERNOON_FROM) return "Good morning!";
        return minute < EVENING_FROM ? "Good afternoon!" : "Good evening!";
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
        return CheckInRules.afterSleep(nowMs + everyMinutes * MINUTE_MS, tz, sleepStartMin, sleepEndMin);
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

    /** Only the meal for this part of the day, never an earlier one. Between the windows there is none. */
    private static String mealToAsk(TodaySnapshot s, int minute) {
        if (!s.caloriesEnabled) return null;
        String meal = mealNow(minute);
        return meal == null || s.mealTypes.contains(meal) ? null : meal;
    }

    private static String mealNow(int minute) {
        if (minute >= BREAKFAST_FROM && minute < BREAKFAST_UNTIL) return "breakfast";
        if (minute >= LUNCH_FROM && minute < LUNCH_UNTIL) return "lunch";
        return minute >= DINNER_FROM ? "dinner" : null;
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
