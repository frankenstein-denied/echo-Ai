package com.echo.app.floating;

import android.content.Context;
import android.os.SystemClock;
import android.util.Log;
import com.echo.app.echo.ChatLine;
import com.echo.app.echo.CheckInPrefs;
import com.echo.app.echo.EchoApi;
import com.echo.app.echo.FirestoreJson;
import com.echo.app.echo.Goal;
import com.echo.app.echo.Reminder;
import com.echo.app.echo.SessionStore;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Collections;
import java.util.Comparator;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Check-ins written by Echo's AI from the user's day, with the {@link CheckInPlanner} templates as the fallback.
 * One request per check-in at most, made ahead of time so firing only reads memory. Safe from any thread.
 */
final class SmartCheckIns {
    private static final String TAG = "CheckInTiming";
    private static final long MINUTE_MS = 60_000L;
    /** Per device and local day; beyond it the templates speak. */
    static final int MAX_PER_DAY = 48;
    /** Shorter gaps are for testing and would burn the free quota. */
    static final int MIN_GAP_MINUTES = 10;
    /** A text older than this is about a day that has moved on. */
    static final long MAX_AGE_MS = 30 * MINUTE_MS;
    static final int SHORT_MAX = 40;
    private static final int CHAT_TO_READ = 50;
    /** Enough of today's chat to remember what was said this morning, not only the last few lines. */
    static final int CHAT_LINES = 16;
    private static final int MEALS = 8;
    private static final int FOOD_MAX = 80;
    private static final int CHECK_INS = 5;
    private static final int GOALS = 3;
    private static final int REMINDERS = 5;
    private static final int LINE_MAX = 300;
    private static final long REMINDER_WINDOW_MS = 24 * 60 * MINUTE_MS;

    /** A text made for one check-in: its slot is the last-fired time it follows. */
    static final class Text {
        final String day;
        final long slot;
        final CheckInPlanner.Topic topic;
        final long createdAtMs;
        final String shortText;
        final String fullText;

        Text(String day, long slot, CheckInPlanner.Topic topic, long createdAtMs, String shortText, String fullText) {
            this.day = day;
            this.slot = slot;
            this.topic = topic;
            this.createdAtMs = createdAtMs;
            this.shortText = shortText;
            this.fullText = fullText;
        }
    }

    /** What one request is about, gathered from memory on the caller's thread. */
    static final class Ask {
        final Context app;
        final CheckInPrefs prefs;
        final TodaySnapshot data;
        final long slot;
        final int everyMinutes;
        /** When the check-in will fire: the request is written for that moment. */
        final long forMs;
        final CheckInPlanner.Topic topic;
        final TimeZone tz;
        final String pendingText;

        Ask(Context app, CheckInPrefs prefs, TodaySnapshot data, long slot, int everyMinutes, long forMs,
            CheckInPlanner.Topic topic, TimeZone tz, String pendingText) {
            this.app = app.getApplicationContext();
            this.prefs = prefs;
            this.data = data;
            this.slot = slot;
            this.everyMinutes = everyMinutes;
            this.forMs = forMs;
            this.topic = topic;
            this.tz = tz;
            this.pendingText = pendingText;
        }
    }

    private static final Object LOCK = new Object();
    private static final ExecutorService EXEC = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "echo-checkin-ai");
        t.setDaemon(true);
        return t;
    });
    private static Text ready;
    private static Future<Text> inFlight;
    private static long inFlightSlot;
    private static long attemptSlot = Long.MIN_VALUE;
    private static long attemptAtMs;

    private SmartCheckIns() {}

    /** The text made for this check-in, if there is one that still applies. Never blocks. */
    static Text readyFor(long slot, String day, CheckInPlanner.Topic topic, long nowMs) {
        synchronized (LOCK) {
            return fits(ready, slot, day, topic, nowMs) ? ready : null;
        }
    }

    /**
     * Starts a request for this check-in unless one is running for it, it was tried in the last 30 minutes,
     * the gap is too short or today's cap is used. True when one for this slot is running afterwards. Never blocks.
     */
    static boolean ensure(Ask ask) {
        if (!allowedForGap(ask.everyMinutes) || ask.prefs == null || ask.data == null) return false;
        long now = System.currentTimeMillis();
        String day = FirestoreJson.dateKey(ask.forMs, ask.tz);
        synchronized (LOCK) {
            if (inFlight != null && !inFlight.isDone()) return inFlightSlot == ask.slot;
            if (ready != null && ready.slot == ask.slot && fresh(ready, day, now)) return false;
            if (attemptSlot == ask.slot && now - attemptAtMs < MAX_AGE_MS) return false;
            try {
                if (!SessionStore.get(ask.app).takeAiCheckIn(FirestoreJson.dateKey(now, ask.tz), MAX_PER_DAY)) {
                    Log.i(TAG, "ai_skipped=daily_cap");
                    return false;
                }
            } catch (IllegalStateException e) {
                return false;
            }
            attemptSlot = ask.slot;
            attemptAtMs = now;
            inFlightSlot = ask.slot;
            inFlight = EXEC.submit(() -> request(ask, day));
            return true;
        }
    }

    /** Waits up to waitMs for the request running for this slot. Null if there is none, it failed or it is late. */
    static Text await(long slot, long waitMs) {
        Future<Text> f;
        synchronized (LOCK) {
            if (inFlight == null || inFlightSlot != slot) return null;
            f = inFlight;
        }
        try {
            return f.get(Math.max(0, waitMs), TimeUnit.MILLISECONDS);
        } catch (Exception e) { // timeout, failure or interrupt: the templates speak
            return null;
        }
    }

    /** Blocking. The ready text, else the running or a fresh request, waiting up to waitMs. Null means templates. */
    static Text obtain(Ask ask, long waitMs) {
        String day = FirestoreJson.dateKey(ask.forMs, ask.tz);
        Text t = readyFor(ask.slot, day, ask.topic, System.currentTimeMillis());
        if (t != null || !ensure(ask)) return t;
        t = await(ask.slot, waitMs);
        return fits(t, ask.slot, day, ask.topic, System.currentTimeMillis()) ? t : null;
    }

    /** The plan with the AI's words. Topic and everything that follows from it stay the planner's. */
    static CheckInPlanner.Plan apply(CheckInPlanner.Plan plan, Text text) {
        return text == null ? plan : new CheckInPlanner.Plan(plan.topic, text.shortText, text.fullText);
    }

    private static Text request(Ask ask, String day) {
        long started = SystemClock.elapsedRealtime();
        EchoApi api = new EchoApi(ask.app);
        List<ChatLine> chat = api.todaysChat(ask.tz, CHAT_TO_READ);
        List<Goal> goals = api.listGoals();
        String body = buildRequest(ask.prefs, ask.data, ask.topic, ask.forMs, ask.tz,
            chat == null ? new ArrayList<>() : chat, goals == null ? new ArrayList<>() : goals, ask.pendingText);
        EchoApi.AiText got = api.writeCheckInText(body);
        Log.i(TAG, "ai_request_ms=" + (SystemClock.elapsedRealtime() - started) + " ok=" + (got != null));
        if (got == null) return null;
        Text t = new Text(day, ask.slot, ask.topic, System.currentTimeMillis(), fitShort(got.shortText), got.fullText);
        synchronized (LOCK) {
            ready = t;
        }
        return t;
    }

    // ---- pure logic ----

    static boolean allowedForGap(int everyMinutes) {
        return everyMinutes >= MIN_GAP_MINUTES;
    }

    /** Made for this check-in, on this day, within 30 minutes, about the topic the planner still picks. */
    static boolean fits(Text t, long slot, String day, CheckInPlanner.Topic topic, long nowMs) {
        return t != null && t.slot == slot && t.topic == topic && fresh(t, day, nowMs);
    }

    private static boolean fresh(Text t, String day, long nowMs) {
        return day.equals(t.day) && nowMs - t.createdAtMs <= MAX_AGE_MS && nowMs >= t.createdAtMs - MINUTE_MS;
    }

    /** The server keeps it to 40 characters; this only guards the bubble if it ever doesn't. */
    static String fitShort(String text) {
        String t = text == null ? "" : text.trim();
        if (t.length() <= SHORT_MAX) return t;
        String cut = t.substring(0, SHORT_MAX - 1);
        int space = cut.lastIndexOf(' ');
        return (space >= 20 ? cut.substring(0, space) : cut).replaceAll("[\\s,;:.!?-]+$", "") + "…";
    }

    static String partOfDay(int minute) {
        if (minute < 5 * 60) return "night";
        if (minute < 12 * 60) return "morning";
        if (minute < 17 * 60) return "afternoon";
        return minute < 21 * 60 ? "evening" : "night";
    }

    /** The compact request body: no document ids, texts trimmed, only what a friend would draw on. */
    static String buildRequest(CheckInPrefs p, TodaySnapshot s, CheckInPlanner.Topic topic, long forMs, TimeZone tz,
                               List<ChatLine> chat, List<Goal> goals, String pendingText) {
        try {
            int minute = CheckInPlanner.minuteOfDay(forMs, tz);
            JSONObject o = new JSONObject()
                .put("localTime", format("EEE, MMM d, h:mm a", forMs, tz))
                .put("partOfDay", partOfDay(minute))
                .put("topic", topic.name());
            if (p.sleepStartMin != p.sleepEndMin) {
                o.put("minutesSinceWake", Math.floorMod(minute - p.sleepEndMin, 24 * 60));
                o.put("minutesUntilSleep", Math.floorMod(p.sleepStartMin - minute, 24 * 60));
            }
            String name = p.preferredName != null ? p.preferredName : s.preferredName;
            if (name != null && !name.trim().isEmpty()) o.put("name", name.trim());
            if (p.tone != null && !p.tone.trim().isEmpty()) o.put("tone", p.tone.trim());

            JSONObject health = new JSONObject()
                .put("waterGlasses", s.waterGlasses)
                .put("waterGoal", s.waterGoal);
            if (s.moodTag != null && !s.moodTag.isEmpty()) health.put("moodTag", s.moodTag);
            if (s.mood != null) health.put("mood", s.mood.intValue());
            if (s.sleepMinutes != null) health.put("sleepMinutes", s.sleepMinutes.intValue());
            if (s.energy != null && !s.energy.isEmpty()) health.put("energy", s.energy);
            o.put("health", health);

            JSONObject meals = new JSONObject().put("tracking", s.caloriesEnabled);
            if (s.caloriesEnabled) {
                List<String> types = new ArrayList<>(s.mealTypes);
                Collections.sort(types);
                meals.put("types", new JSONArray(types));
                meals.put("kcal", s.kcalToday);
                JSONArray items = new JSONArray();
                List<TodaySnapshot.Meal> eaten = s.meals == null ? new ArrayList<>() : s.meals;
                for (TodaySnapshot.Meal m : eaten.subList(Math.max(0, eaten.size() - MEALS), eaten.size())) {
                    JSONObject j = new JSONObject().put("type", m.type).put("food", clip(m.food, FOOD_MAX));
                    if (m.atMs > 0) j.put("time", clock(m.atMs, tz));
                    items.put(j);
                }
                meals.put("items", items);
                if (s.calorieGoal != null && s.calorieGoal > 0) meals.put("calorieGoal", s.calorieGoal.intValue());
            }
            o.put("meals", meals);

            JSONArray reminders = new JSONArray();
            for (Reminder r : remindersAhead(s.openReminders, forMs)) {
                reminders.put(new JSONObject().put("title", clip(r.title, 100)).put("when", when(r.dueAtMs, forMs, tz))
                    .put("minutesAway", Math.max(0L, (r.dueAtMs - forMs) / MINUTE_MS)));
            }
            o.put("reminders", reminders);

            JSONArray goalsOut = new JSONArray();
            for (Goal g : openGoals(goals)) {
                JSONObject j = new JSONObject().put("title", clip(g.title, 100)).put("progress", (int) Math.round(g.progress));
                if (g.nextMilestone != null) j.put("nextMilestone", clip(g.nextMilestone, 100));
                goalsOut.put(j);
            }
            o.put("goals", goalsOut);

            List<ChatLine> talk = new ArrayList<>();
            List<String> checkIns = new ArrayList<>();
            for (ChatLine line : chat) {
                if (line.checkIn) checkIns.add(clip(line.text, LINE_MAX)); else talk.add(line);
            }
            if (pendingText != null && !pendingText.trim().isEmpty() && !checkIns.contains(clip(pendingText, LINE_MAX))) {
                checkIns.add(clip(pendingText, LINE_MAX));
            }
            JSONArray messages = new JSONArray();
            for (ChatLine line : talk.subList(Math.max(0, talk.size() - CHAT_LINES), talk.size())) {
                JSONObject j = new JSONObject().put("role", line.fromUser ? "user" : "echo").put("text", clip(line.text, LINE_MAX));
                if (line.atMs > 0) j.put("time", clock(line.atMs, tz));
                messages.put(j);
            }
            o.put("messages", messages);
            o.put("recentCheckIns", new JSONArray(checkIns.subList(Math.max(0, checkIns.size() - CHECK_INS), checkIns.size())));
            return o.toString();
        } catch (JSONException e) {
            throw new IllegalStateException(e);
        }
    }

    /** Open reminders due from now to a day ahead, soonest first. */
    static List<Reminder> remindersAhead(List<Reminder> all, long nowMs) {
        List<Reminder> out = new ArrayList<>();
        for (Reminder r : all) {
            if (r.done || r.title == null || r.title.trim().isEmpty()) continue;
            if (r.dueAtMs < nowMs || r.dueAtMs - nowMs > REMINDER_WINDOW_MS) continue;
            out.add(r);
        }
        Collections.sort(out, new Comparator<Reminder>() {
            @Override public int compare(Reminder a, Reminder b) {
                return Long.compare(a.dueAtMs, b.dueAtMs);
            }
        });
        return out.subList(0, Math.min(REMINDERS, out.size()));
    }

    /** Goals not yet finished, the most recently touched first. */
    static List<Goal> openGoals(List<Goal> all) {
        List<Goal> open = new ArrayList<>();
        for (Goal g : all) {
            if (g.title != null && !g.title.trim().isEmpty() && g.progress < 100) open.add(g);
        }
        return FirestoreJson.pickTopGoals(open, GOALS);
    }

    /**
     * How far off and when: {@code in 20 min, at 4:30 PM}, {@code in 2 h, today at 4 PM} or
     * {@code in 14 h, tomorrow at 9 AM}. Always says it is still to come, so it can't read as past.
     */
    static String when(long dueMs, long nowMs, TimeZone tz) {
        long minutes = Math.max(1, (dueMs - nowMs) / MINUTE_MS);
        String clock = clock(dueMs, tz);
        if (minutes < 60) return "in " + minutes + " min, at " + clock;
        String away = "in " + (minutes / 60) + " h" + (minutes % 60 == 0 ? "" : " " + (minutes % 60) + " min");
        Calendar due = Calendar.getInstance(tz);
        due.setTimeInMillis(dueMs);
        Calendar now = Calendar.getInstance(tz);
        now.setTimeInMillis(nowMs);
        boolean today = due.get(Calendar.YEAR) == now.get(Calendar.YEAR)
            && due.get(Calendar.DAY_OF_YEAR) == now.get(Calendar.DAY_OF_YEAR);
        return away + ", " + (today ? "today" : "tomorrow") + " at " + clock;
    }

    /** {@code 4 PM} or {@code 8:05 AM}. */
    static String clock(long ms, TimeZone tz) {
        return format("h:mm a", ms, tz).replace(":00 ", " ");
    }

    private static String clip(String s, int max) {
        String t = s == null ? "" : s.replaceAll("\\s+", " ").trim();
        if (t.length() <= max) return t;
        int end = Character.isHighSurrogate(t.charAt(max - 1)) ? max - 1 : max;
        return t.substring(0, end);
    }

    private static String format(String pattern, long ms, TimeZone tz) {
        SimpleDateFormat f = new SimpleDateFormat(pattern, Locale.US);
        f.setTimeZone(tz);
        return f.format(new Date(ms));
    }
}
