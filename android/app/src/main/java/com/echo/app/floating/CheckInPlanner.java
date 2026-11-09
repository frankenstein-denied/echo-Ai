package com.echo.app.floating;

import com.echo.app.echo.FirestoreJson;
import com.echo.app.echo.Reminder;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.List;
import java.util.TimeZone;

/** Pure choice of what a check-in asks. Fixed templates only: nothing here calls an AI. */
public final class CheckInPlanner {
    public enum Topic { REMINDER, MORNING, NIGHT, MEAL, WATER, MOOD, CALORIES, OVERVIEW }

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
    /** Closer than this, a reminder on the next day is plainly tonight or the coming morning. */
    private static final long NAME_THE_DAY_FROM_MS = 12 * 60 * MINUTE_MS;
    private static final int TITLE_MAX = 24;
    private static final int BREAKFAST_FROM = 7 * 60;
    private static final int BREAKFAST_UNTIL = 11 * 60;
    private static final int LUNCH_FROM = 12 * 60;
    private static final int LUNCH_UNTIL = 17 * 60;
    private static final int DINNER_FROM = 18 * 60; // runs until sleep, and nothing fires in sleep time
    private static final int AFTERNOON_FROM = 12 * 60;
    private static final int EVENING_FROM = 18 * 60;
    /** The good morning chat belongs to this long after the user's wake time. */
    private static final int MORNING_CHAT_MINUTES = 120;
    /** The good night chat belongs to this long before the user's sleep time. */
    private static final int NIGHT_CHAT_MINUTES = 90;
    private static final int NO_WATER_BEFORE_SLEEP_MINUTES = 60;
    /** Food logged this long before a meal window opens may still be that meal (an early breakfast). */
    private static final int MEAL_EARLY_MINUTES = 60;
    private static final int FOOD_MAX = 30;

    /*
     * The wording, as {chat message, small message} pairs. The small message never carries the name, so it
     * always fits. "{, name}" is dropped when no name is set. One line in three has it, so about one
     * message in three uses the name. Never mention logging, tracking or a count of zero here.
     */
    private static final String[][] BREAKFAST = {
        {"Morning! Did you get some breakfast in?", "Did you get some breakfast in?"},
        {"Good morning{, name}. What's for breakfast today?", "What's for breakfast today?"},
        {"Hey, had anything to eat yet this morning?", "Had anything to eat yet?"},
    };
    private static final String[][] LUNCH = {
        {"Hey{, name}, have you had lunch yet? What did you get?", "Have you had lunch yet?"},
        {"It's about lunchtime. Don't skip it! What are you having?", "It's about lunchtime."},
        {"Lunch break yet? Tell me what you ate.", "Lunch break yet?"},
    };
    private static final String[][] DINNER = {
        {"Good evening{, name}. What's for dinner tonight?", "What's for dinner tonight?"},
        {"Had dinner yet? I want to hear what you made.", "Had dinner yet?"},
        {"Evening! Did you get something good to eat?", "Did you get something good to eat?"},
    };
    /** Food already logged in this meal's window, but as a snack: ask, don't ask what they ate. */
    private static final String[] MEAL_CONFIRM = {
        "Was the {food} your {meal}?",
        "Hey{, name}, was the {food} your {meal}?",
        "Did the {food} count as your {meal}?",
    };
    private static final String[][] WATER_NONE = {
        {"Have you had any water today? Go grab a glass for me.", "Have you had any water today?"},
        {"Hey{, name}, don't forget to drink some water today.", "Don't forget to drink some water."},
        {"Thirsty yet? A glass of water would do you good.", "Thirsty yet?"},
    };
    private static final String[][] WATER_SOME = {
        {"Quick water break? You're doing well so far.", "Quick water break?"},
        {"Hey{, name}, time for another glass of water?", "Time for another glass of water?"},
        {"Keep it up! How about a little more water?", "How about a little more water?"},
    };
    private static final String[][] WATER_HALF = {
        {"You're over halfway to your water goal. One more glass?", "Over halfway to your water goal!"},
        {"Nice work on the water today{, name}. Keep going?", "Nice work on the water today."},
        {"Your water's looking good today. One more glass?", "One more glass of water?"},
    };
    private static final String[][] MOOD = {
        {"How's your day going so far?", "How's your day going so far?"},
        {"Hey{, name}, how are you feeling right now?", "How are you feeling right now?"},
        {"Just checking in. How's today treating you?", "How's today treating you?"},
    };
    private static final String[][] GOOD_MORNING = {
        {"Good morning{, name}! How did you sleep? How's your energy today?", "Good morning! How did you sleep?"},
        {"Morning! Did you sleep okay? How's your energy feeling?", "Morning! Did you sleep okay?"},
        {"Hey, you're up! How was your sleep? Got much energy today?", "Hey, you're up! How was your sleep?"},
    };
    /** For a day whose energy is already logged: the same chat, without asking twice. */
    private static final String[][] GOOD_MORNING_WARM = {
        {"Good morning{, name}! How did you sleep?", "Good morning! How did you sleep?"},
        {"Morning! Did you sleep okay?", "Morning! Did you sleep okay?"},
        {"Hey, you're up! Hope you slept well.", "Hey, you're up! Hope you slept well."},
    };
    private static final String[][] GOOD_NIGHT = {
        {"Getting close to bedtime. How's your energy after today? Sleep well{, name}.", "Getting close to bedtime."},
        {"Almost time to wind down. How much energy do you have left?", "Almost time to wind down."},
        {"Long day? How's your energy now it's nearly bedtime?", "Long day? How's your energy?"},
    };
    private static final String[][] GOOD_NIGHT_WARM = {
        {"Getting close to bedtime. Hope today was kind to you. Sleep well{, name}.", "Getting close to bedtime."},
        {"Almost time to wind down. Anything good from today?", "Almost time to wind down."},
        {"Long day? Take it easy tonight, it's nearly bedtime.", "It's nearly bedtime."},
    };
    private static final String[][] FOOD_NEAR = {
        {"You've eaten pretty well today, you're close to your goal.", "You're close to your food goal."},
        {"Hey{, name}, you're getting close to your food goal for today.", "Getting close to your food goal."},
        {"Nice, you're nearly at your food goal today.", "Nearly at your food goal."},
    };
    private static final String[][] FOOD_REACHED = {
        {"You've reached your food goal for today. How are you feeling?", "You've reached your food goal."},
        {"Hey{, name}, that's your food goal reached today. Feeling good?", "That's your food goal reached."},
        {"You hit your food goal today. How was everything?", "You hit your food goal today."},
    };
    private static final String[][] DAY_MORNING = {
        {"Hope your morning's going well. Anything on your mind?", "Hope your morning's going well."},
        {"Good morning{, name}. What's the plan for today?", "What's the plan for today?"},
        {"Morning! Anything you're looking forward to today?", "Looking forward to anything today?"},
    };
    private static final String[][] DAY_AFTERNOON = {
        {"How's the afternoon going? Tell me something good.", "How's the afternoon going?"},
        {"Hey{, name}, how's your afternoon so far?", "How's your afternoon so far?"},
        {"Good afternoon! Anything fun happen today?", "Anything fun happen today?"},
    };
    private static final String[][] DAY_EVENING = {
        {"How was your day? I'd love to hear about it.", "How was your day?"},
        {"Good evening{, name}. Anything good happen today?", "Anything good happen today?"},
        {"Winding down yet? Tell me about your day.", "Winding down yet?"},
    };
    /** The small message for a reminder is its title and time, built in {@link #plan}. */
    private static final String[] REMINDER = {
        "Hey, don't forget {title} {when}.",
        "Just a heads up: {title} {when}.",
        "Hey{, name}, {title} is coming up {when}.",
    };

    private CheckInPlanner() {}

    /**
     * The seed picks the wording: the same seed always gives the same line. The two flags say the good
     * morning and good night chats already happened on this {@link #wakingDay}.
     */
    public static Plan plan(TodaySnapshot s, Topic lastTopic, long nowMs, TimeZone tz,
                            int everyMinutes, int sleepStartMin, int sleepEndMin, int seed,
                            boolean morningDone, boolean nightDone) {
        int minute = minuteOfDay(nowMs, tz);
        long nextCheckInMs = nextCheckInMs(nowMs, tz, everyMinutes, sleepStartMin, sleepEndMin);
        Reminder soonest = nextReminder(s, nowMs);
        boolean reminderDue = soonest != null && soonest.dueAtMs <= nextCheckInMs;
        String meal = mealToAsk(s, minute);
        boolean sleeps = sleepStartMin != sleepEndMin; // equal times mean never asleep: no day to open or close
        boolean morningTime = sleeps && floorMod(minute - sleepEndMin) < MORNING_CHAT_MINUTES;
        int untilSleep = floorMod(sleepStartMin - minute);
        boolean nightTime = sleeps && untilSleep <= NIGHT_CHAT_MINUTES;
        boolean waterTime = !sleeps || untilSleep > NO_WATER_BEFORE_SLEEP_MINUTES;

        List<Topic> missing = new ArrayList<>();
        if (reminderDue) missing.add(Topic.REMINDER);
        if (morningTime && !morningDone) missing.add(Topic.MORNING);
        if (nightTime && !nightDone) missing.add(Topic.NIGHT);
        if (meal != null) missing.add(Topic.MEAL);
        if (waterTime && behindOnWater(s, minute, sleepStartMin, sleepEndMin)) missing.add(Topic.WATER);
        if (!s.moodLogged && !morningTime && !nightTime) missing.add(Topic.MOOD);
        if (nearCalorieGoal(s)) missing.add(Topic.CALORIES);

        Topic topic = pick(missing, lastTopic);
        // Check-ins land one gap apart, so a plain seed % 3 would pick the same line every time on a gap of 60 or 120.
        int step = seed / Math.max(1, everyMinutes);
        String name = usableName(s.preferredName);
        switch (topic) {
            case REMINDER: {
                String time = formatTime(soonest.dueAtMs, tz);
                boolean nameTheDay = !sameDay(soonest.dueAtMs, nowMs, tz) && soonest.dueAtMs - nowMs >= NAME_THE_DAY_FROM_MS; // the time alone could read as past
                String day = FirestoreJson.pageTitle(soonest.dueAtMs, tz);
                String when = nameTheDay ? "on " + day + " at " + time : "at " + time;
                String full = withName(REMINDER[Math.floorMod(step, REMINDER.length)], name)
                    .replace("{when}", when).replace("{title}", soonest.title);
                return new Plan(topic, shortTitle(soonest.title) + (nameTheDay ? " on " + day : " at " + time), full);
            }
            case MORNING:
                return say(topic, s.energyLogged ? GOOD_MORNING_WARM : GOOD_MORNING, step, name);
            case NIGHT:
                return say(topic, s.energyLogged ? GOOD_NIGHT_WARM : GOOD_NIGHT, step, name);
            case MEAL: {
                TodaySnapshot.Meal eaten = eatenAsOther(s, meal, nowMs, tz);
                if (eaten != null) return confirmMeal(eaten, meal, step, name);
                return say(topic, mealLines(meal), step, name);
            }
            case WATER:
                return say(topic, waterLines(s), step, name);
            case MOOD:
                return say(topic, MOOD, step, name);
            case CALORIES:
                return say(topic, s.kcalToday >= s.calorieGoal ? FOOD_REACHED : FOOD_NEAR, step, name);
            default:
                return say(topic, minute < AFTERNOON_FROM ? DAY_MORNING : minute < EVENING_FROM ? DAY_AFTERNOON : DAY_EVENING, step, name);
        }
    }

    /** The user's day, which turns over at their wake time: a late bedtime past midnight still counts as yesterday. */
    static String wakingDay(long nowMs, TimeZone tz, int sleepEndMin) {
        return FirestoreJson.dateKey(nowMs - sleepEndMin * MINUTE_MS, tz);
    }

    private static Plan say(Topic topic, String[][] lines, int step, String name) {
        String[] line = lines[Math.floorMod(step, lines.length)];
        return new Plan(topic, line[1], withName(line[0], name));
    }

    private static String withName(String text, String name) {
        return text.replace("{, name}", name == null ? "" : ", " + name);
    }

    private static String usableName(String name) {
        String trimmed = name == null ? "" : name.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private static Plan confirmMeal(TodaySnapshot.Meal eaten, String meal, int step, String name) {
        String line = MEAL_CONFIRM[Math.floorMod(step, MEAL_CONFIRM.length)]
            .replace("{food}", eaten.food).replace("{meal}", meal);
        String plain = withName(line, null);
        String small = plain.length() <= SmartCheckIns.SHORT_MAX ? plain : "Was that your " + meal + "?";
        return new Plan(Topic.MEAL, small, withName(line, name));
    }

    /**
     * Food logged today as a snack (or with no type) in this meal's window or just before it: likely the meal
     * itself, so Echo asks whether it was, instead of asking what they had. The latest such food, or null.
     */
    static TodaySnapshot.Meal eatenAsOther(TodaySnapshot s, String meal, long nowMs, TimeZone tz) {
        if (meal == null || s.meals == null) return null;
        int from = mealFrom(meal) - MEAL_EARLY_MINUTES;
        TodaySnapshot.Meal best = null;
        for (TodaySnapshot.Meal m : s.meals) {
            if (!m.type.isEmpty() && !"snack".equals(m.type)) continue;
            String food = m.food.trim();
            if (food.isEmpty() || food.length() > FOOD_MAX || m.atMs <= 0 || m.atMs > nowMs) continue;
            if (!sameDay(m.atMs, nowMs, tz) || minuteOfDay(m.atMs, tz) < from) continue;
            if (best == null || m.atMs > best.atMs) best = m;
        }
        return best;
    }

    private static int mealFrom(String meal) {
        if ("breakfast".equals(meal)) return BREAKFAST_FROM;
        return "lunch".equals(meal) ? LUNCH_FROM : DINNER_FROM;
    }

    private static String[][] mealLines(String meal) {
        if ("breakfast".equals(meal)) return BREAKFAST;
        return "lunch".equals(meal) ? LUNCH : DINNER;
    }

    private static String[][] waterLines(TodaySnapshot s) {
        if (s.waterGlasses <= 0) return WATER_NONE;
        return s.waterGlasses * 2 >= s.waterGoal ? WATER_HALF : WATER_SOME;
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
