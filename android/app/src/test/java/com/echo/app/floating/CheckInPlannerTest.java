package com.echo.app.floating;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertTrue;

import com.echo.app.echo.Reminder;
import com.echo.app.floating.CheckInPlanner.Plan;
import com.echo.app.floating.CheckInPlanner.Topic;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Calendar;
import java.util.HashSet;
import java.util.TimeZone;
import org.junit.Test;

public class CheckInPlannerTest {
    private static final long MINUTE_MS = 60_000L;
    private static final int SLEEP_START = 22 * 60;
    private static final int SLEEP_END = 7 * 60;
    private static final TimeZone TZ = TimeZone.getTimeZone("Asia/Manila");

    private static long at(int hour, int minute) {
        return at(TZ, 2026, Calendar.NOVEMBER, 6, hour, minute);
    }

    private static long at(TimeZone tz, int year, int month, int day, int hour, int minute) {
        Calendar c = Calendar.getInstance(tz);
        c.clear();
        c.set(year, month, day, hour, minute, 0);
        return c.getTimeInMillis();
    }

    /** Nothing is missing at any waking hour, so each test only states what it leaves out. */
    private static TodaySnapshot allLogged() {
        TodaySnapshot s = new TodaySnapshot();
        s.dateKey = "2026-11-06";
        s.fetchedAtMs = at(12, 0);
        s.waterGoal = 8;
        s.waterGlasses = 8;
        s.moodLogged = true;
        s.moodTag = "happy";
        s.energyLogged = true;
        s.energy = "high";
        s.caloriesEnabled = true;
        s.kcalToday = 540;
        s.calorieGoal = null;
        s.mealTypes = new HashSet<>(Arrays.asList("breakfast", "lunch", "dinner"));
        s.openReminders = new ArrayList<>();
        return s;
    }

    private static Reminder reminder(String title, long dueAtMs) {
        return new Reminder(title, title, dueAtMs, false);
    }

    private static Plan plan(TodaySnapshot s, Topic last, long nowMs, int everyMinutes) {
        return CheckInPlanner.plan(s, last, nowMs, TZ, everyMinutes, SLEEP_START, SLEEP_END);
    }

    private static Plan plan(TodaySnapshot s, long nowMs) {
        return plan(s, null, nowMs, 120);
    }

    @Test public void reminderBeforeNextCheckInComesFirst() {
        TodaySnapshot s = allLogged();
        s.mealTypes.remove("lunch");
        long now = at(14, 30);
        s.openReminders.add(reminder("Dentist", now + 90 * MINUTE_MS));
        Plan p = plan(s, now);
        assertEquals(Topic.REMINDER, p.topic);
        assertEquals("Dentist at 4 PM", p.shortText);
    }

    @Test public void reminderAfterNextCheckInDoesNotCount() {
        TodaySnapshot s = allLogged();
        long now = at(14, 30);
        s.openReminders.add(reminder("Dentist", now + 180 * MINUTE_MS));
        Plan p = plan(s, now);
        assertNotEquals(Topic.REMINDER, p.topic);
    }

    @Test public void reminderExactlyAtNextCheckInCounts() {
        TodaySnapshot s = allLogged();
        long now = at(14, 30);
        s.openReminders.add(reminder("Dentist", now + 120 * MINUTE_MS));
        assertEquals(Topic.REMINDER, plan(s, now).topic);
    }

    @Test public void reminderInSleepTimeCountsBecauseNoCheckInComesBeforeIt() {
        TodaySnapshot s = allLogged();
        long now = at(21, 50);
        s.openReminders.add(reminder("Pills", at(22, 30)));
        Plan p = plan(s, null, now, 30);
        assertEquals(Topic.REMINDER, p.topic);
        assertEquals("Pills at 10:30 PM", p.shortText);
    }

    @Test public void earliestReminderIsChosen() {
        TodaySnapshot s = allLogged();
        s.openReminders.add(reminder("Later", at(15, 30)));
        s.openReminders.add(reminder("Sooner", at(15, 0)));
        assertEquals("Sooner at 3 PM", plan(s, at(14, 30)).shortText);
    }

    @Test public void doneAndPastRemindersAreIgnored() {
        TodaySnapshot s = allLogged();
        s.openReminders.add(new Reminder("a", "Done", at(15, 0), true));
        s.openReminders.add(reminder("Past", at(14, 0)));
        Plan p = plan(s, at(14, 30));
        assertEquals(Topic.OVERVIEW, p.topic);
        assertFalse(p.fullText.contains("Next up"));
    }

    @Test public void reminderWithNoDueDateIsIgnored() {
        TodaySnapshot s = allLogged();
        s.openReminders.add(reminder("Someday", Long.MAX_VALUE)); // how FirestoreJson reads a missing dueAt
        Plan p = plan(s, at(14, 30));
        assertEquals(Topic.OVERVIEW, p.topic);
        assertFalse(p.fullText.contains("Next up"));
    }

    @Test public void reminderWithNoTitleIsIgnored() {
        TodaySnapshot s = allLogged();
        s.openReminders.add(reminder("", at(15, 0))); // how FirestoreJson reads a missing title
        Plan p = plan(s, at(14, 30));
        assertEquals(Topic.OVERVIEW, p.topic);
        assertFalse(p.fullText.contains("Next up"));
    }

    @Test public void missingLunchInItsWindow() {
        TodaySnapshot s = allLogged();
        s.mealTypes.remove("lunch");
        s.mealTypes.remove("dinner");
        Plan p = plan(s, at(14, 30));
        assertEquals(Topic.MEAL, p.topic);
        assertEquals("Had lunch yet?", p.shortText);
    }

    private static void assertMeal(String meal, TodaySnapshot s, int hour, int minute) {
        Plan p = plan(s, at(hour, minute));
        assertEquals(Topic.MEAL, p.topic);
        assertEquals("Had " + meal + " yet?", p.shortText);
    }

    private static void assertNoMeal(TodaySnapshot s, int hour, int minute) {
        assertNotEquals(Topic.MEAL, plan(s, at(hour, minute)).topic);
    }

    @Test public void breakfastWindowIsSevenUntilEleven() {
        TodaySnapshot s = allLogged();
        s.mealTypes.remove("breakfast");
        assertMeal("breakfast", s, 7, 0);
        assertMeal("breakfast", s, 10, 59);
        assertNoMeal(s, 11, 0);
    }

    @Test public void lunchWindowIsNoonUntilFive() {
        TodaySnapshot s = allLogged();
        s.mealTypes.remove("lunch");
        assertNoMeal(s, 11, 59);
        assertMeal("lunch", s, 12, 0);
        assertMeal("lunch", s, 16, 59);
        assertNoMeal(s, 17, 0);
    }

    @Test public void dinnerWindowStartsAtSixAndRunsToSleep() {
        TodaySnapshot s = allLogged();
        s.mealTypes.remove("dinner");
        assertNoMeal(s, 17, 59);
        assertMeal("dinner", s, 18, 0);
        assertMeal("dinner", s, 21, 59);
    }

    @Test public void noMealQuestionBetweenTheWindows() {
        TodaySnapshot s = allLogged();
        s.mealTypes.clear();
        assertNoMeal(s, 11, 30);
        assertNoMeal(s, 17, 30);
    }

    @Test public void neverAsksAnEarlierMeal() {
        TodaySnapshot s = allLogged();
        s.mealTypes.clear();
        assertMeal("breakfast", s, 10, 0);
        assertMeal("lunch", s, 15, 0);
        assertMeal("dinner", s, 20, 0);
    }

    @Test public void threePmWithLunchLoggedMovesOnFromBreakfast() {
        TodaySnapshot s = allLogged();
        s.mealTypes.remove("breakfast");
        assertNoMeal(s, 15, 0);
    }

    @Test public void noDinnerQuestionAfterMidnightWithALateSleep() {
        TodaySnapshot s = allLogged();
        s.mealTypes.remove("dinner");
        assertNotEquals(Topic.MEAL, CheckInPlanner.plan(s, null, at(0, 30), TZ, 120, 2 * 60, 7 * 60).topic);
    }

    @Test public void neverAsksMealsWithCaloriesOff() {
        TodaySnapshot s = allLogged();
        s.caloriesEnabled = false;
        s.calorieGoal = 500;
        s.mealTypes.clear();
        Plan p = plan(s, at(14, 30));
        assertNotEquals(Topic.MEAL, p.topic);
        assertNotEquals(Topic.CALORIES, p.topic);
        assertFalse(p.fullText.contains("kcal"));
    }

    @Test public void waterPace() {
        TodaySnapshot s = allLogged();
        s.waterGlasses = 3;
        Plan behind = plan(s, at(14, 30));
        assertEquals(Topic.WATER, behind.topic);
        assertEquals("Time for some water?", behind.shortText);

        s.waterGlasses = 4;
        assertNotEquals(Topic.WATER, plan(s, at(14, 30)).topic);
    }

    @Test public void waterPaceWithSleepThatDoesNotCrossMidnight() {
        TodaySnapshot s = allLogged();
        s.waterGlasses = 3;
        // Awake 09:00 to 01:00 is 960 minutes. At 17:00 the pace is floor(8 * 480 / 960) = 4.
        Plan p = CheckInPlanner.plan(s, null, at(17, 0), TZ, 120, 60, 9 * 60);
        assertEquals(Topic.WATER, p.topic);
        s.waterGlasses = 4;
        p = CheckInPlanner.plan(s, null, at(17, 0), TZ, 120, 60, 9 * 60);
        assertNotEquals(Topic.WATER, p.topic);
    }

    @Test public void waterPaceWithNoSleepTimeRunsAcrossTheWholeDay() {
        TodaySnapshot s = allLogged();
        s.waterGlasses = 3;
        // Equal times mean never asleep, so the pace runs midnight to midnight.
        assertNotEquals(Topic.WATER, CheckInPlanner.plan(s, null, at(11, 59), TZ, 120, 420, 420).topic); // pace 3
        assertEquals(Topic.WATER, CheckInPlanner.plan(s, null, at(12, 0), TZ, 120, 420, 420).topic); // pace 4
    }

    @Test public void moodComesBeforeEnergy() {
        TodaySnapshot s = allLogged();
        s.moodLogged = false;
        s.moodTag = null;
        s.energyLogged = false;
        s.energy = null;
        Plan p = plan(s, at(14, 30));
        assertEquals(Topic.MOOD, p.topic);
        assertEquals("How are you feeling?", p.shortText);
    }

    @Test public void energyIsItsOwnTopic() {
        TodaySnapshot s = allLogged();
        s.energyLogged = false;
        s.energy = null;
        Plan p = plan(s, at(14, 30));
        assertEquals(Topic.ENERGY, p.topic);
        assertEquals("How's your energy?", p.shortText);
    }

    @Test public void priorityOrderIsFixed() {
        TodaySnapshot s = allLogged();
        long now = at(14, 30);
        s.openReminders.add(reminder("Dentist", at(15, 0)));
        s.mealTypes.remove("lunch");
        s.waterGlasses = 0;
        s.moodLogged = false;
        s.energyLogged = false;
        s.calorieGoal = 500;
        assertEquals(Topic.REMINDER, plan(s, now).topic);
        s.openReminders.clear();
        assertEquals(Topic.MEAL, plan(s, now).topic);
        s.mealTypes.add("lunch");
        assertEquals(Topic.WATER, plan(s, now).topic);
        s.waterGlasses = 8;
        assertEquals(Topic.MOOD, plan(s, now).topic);
        s.moodLogged = true;
        assertEquals(Topic.ENERGY, plan(s, now).topic);
        s.energyLogged = true;
        assertEquals(Topic.CALORIES, plan(s, now).topic);
        s.calorieGoal = null;
        assertEquals(Topic.OVERVIEW, plan(s, now).topic);
    }

    @Test public void caloriesAtNinetyPercentOfTheGoal() {
        TodaySnapshot s = allLogged();
        s.calorieGoal = 2000;
        s.kcalToday = 1800;
        Plan p = plan(s, at(14, 30));
        assertEquals(Topic.CALORIES, p.topic);
        assertEquals("1800 of 2000 kcal so far", p.shortText);

        s.kcalToday = 1799;
        assertNotEquals(Topic.CALORIES, plan(s, at(14, 30)).topic);
    }

    @Test public void doesNotRepeatTopic() {
        TodaySnapshot s = allLogged();
        s.moodLogged = false;
        s.energyLogged = false;
        Plan p = plan(s, Topic.MOOD, at(14, 30), 120);
        assertEquals(Topic.ENERGY, p.topic);
    }

    @Test public void repeatsWhenOnlyOneTopicLeft() {
        TodaySnapshot s = allLogged();
        s.moodLogged = false;
        Plan p = plan(s, Topic.MOOD, at(14, 30), 120);
        assertEquals(Topic.MOOD, p.topic);
    }

    @Test public void everythingLoggedGivesOverview() {
        Plan p = plan(allLogged(), at(14, 30));
        assertEquals(Topic.OVERVIEW, p.topic);
        assertEquals("Good afternoon! Here's your day so far", p.shortText);
        // The overview repeats when it is the only thing left to say.
        assertEquals(Topic.OVERVIEW, plan(allLogged(), Topic.OVERVIEW, at(14, 30), 120).topic);
    }

    @Test public void fullTextMatchesTheSpec() {
        TodaySnapshot s = allLogged();
        s.waterGlasses = 3;
        s.mealTypes.remove("lunch");
        s.moodLogged = false;
        s.moodTag = null;
        s.energyLogged = false;
        s.energy = null;
        s.openReminders.add(reminder("Dentist", at(17, 0)));
        Plan p = plan(s, at(14, 30));
        assertEquals("Good afternoon! Had lunch yet? What did you eat? So far today: 3 of 8 glasses, 540 kcal, energy not logged. Next up: Dentist at 5 PM.", p.fullText);
    }

    @Test public void greetingFollowsTheClock() {
        assertTrue(plan(allLogged(), at(7, 0)).fullText.startsWith("Good morning! "));
        assertTrue(plan(allLogged(), at(11, 59)).fullText.startsWith("Good morning! "));
        assertTrue(plan(allLogged(), at(12, 0)).fullText.startsWith("Good afternoon! "));
        assertTrue(plan(allLogged(), at(17, 59)).fullText.startsWith("Good afternoon! "));
        assertTrue(plan(allLogged(), at(18, 0)).fullText.startsWith("Good evening! "));
        assertTrue(plan(allLogged(), at(21, 59)).fullText.startsWith("Good evening! "));
    }

    @Test public void onlyTheOverviewGreetsInItsShortText() {
        assertEquals("Good morning! Here's your day so far", plan(allLogged(), at(9, 0)).shortText);
        assertEquals("Good evening! Here's your day so far", plan(allLogged(), at(19, 0)).shortText);
        assertTrue(plan(allLogged(), at(14, 0)).shortText.length() <= 40);

        TodaySnapshot s = allLogged();
        s.moodLogged = false;
        assertEquals("How are you feeling?", plan(s, at(9, 0)).shortText);
    }

    @Test public void everyTopicsFullTextStartsWithTheGreeting() {
        TodaySnapshot water = allLogged();
        water.waterGlasses = 0;
        assertTrue(plan(water, at(15, 0)).fullText.startsWith("Good afternoon! Time for some water? "));

        TodaySnapshot energy = allLogged();
        energy.energyLogged = false;
        assertTrue(plan(energy, at(15, 0)).fullText.startsWith("Good afternoon! How's your energy? "));

        TodaySnapshot calories = allLogged();
        calories.kcalToday = 1800;
        calories.calorieGoal = 2000;
        assertTrue(plan(calories, at(15, 0)).fullText.startsWith("Good afternoon! 1800 of 2000 kcal so far. "));
    }

    @Test public void overviewShowsLoggedValuesPlainly() {
        Plan p = plan(allLogged(), at(14, 30));
        assertEquals("Good afternoon! Here's your day so far. So far today: 8 of 8 glasses, 540 kcal, mood happy, energy high.", p.fullText);
    }

    @Test public void missingMoodIsLeftOutOfTheOverview() {
        TodaySnapshot s = allLogged();
        s.moodLogged = false;
        s.moodTag = null;
        Plan p = plan(s, at(14, 30));
        assertEquals("Good afternoon! How are you feeling? So far today: 8 of 8 glasses, 540 kcal, energy high.", p.fullText);
    }

    @Test public void loggedMoodWithNoTagStillReadsAsLogged() {
        TodaySnapshot s = allLogged();
        s.moodTag = null;
        assertTrue(plan(s, at(14, 30)).fullText.contains("540 kcal, mood logged, energy high."));
    }

    @Test public void reminderFullTextUsesItsOwnQuestionForm() {
        TodaySnapshot s = allLogged();
        s.openReminders.add(reminder("Dentist", at(15, 30)));
        Plan p = plan(s, at(14, 30));
        assertEquals("Good afternoon! Your Dentist reminder is at 3:30 PM. So far today: 8 of 8 glasses, 540 kcal, mood happy, energy high. Next up: Dentist at 3:30 PM.", p.fullText);
    }

    @Test public void nextUpIsTheEarliestReminderLeftToday() {
        TodaySnapshot s = allLogged();
        s.openReminders.add(reminder("Gym", at(19, 0)));
        s.openReminders.add(reminder("Dentist", at(17, 30)));
        assertTrue(plan(s, at(14, 30)).fullText.endsWith(" Next up: Dentist at 5:30 PM."));
    }

    @Test public void nextUpLeavesOutTomorrow() {
        TodaySnapshot s = allLogged();
        s.openReminders.add(reminder("Dentist", at(23, 59) + 10 * 60 * MINUTE_MS));
        assertFalse(plan(s, at(14, 30)).fullText.contains("Next up"));
    }

    @Test public void timesUseThePhonesTimeZone() {
        TodaySnapshot s = allLogged();
        long now = at(14, 30);
        s.openReminders.add(reminder("Dentist", at(15, 0)));
        TimeZone tokyo = TimeZone.getTimeZone("Asia/Tokyo"); // one hour ahead of Manila
        Plan p = CheckInPlanner.plan(s, null, now, tokyo, 120, SLEEP_START, SLEEP_END);
        assertEquals("Dentist at 4 PM", p.shortText);
    }

    @Test public void noonAndMidnightAreTwelve() {
        TodaySnapshot s = allLogged();
        s.openReminders.add(reminder("Lunch", at(12, 0)));
        assertEquals("Lunch at 12 PM", plan(s, at(11, 0)).shortText);

        s.openReminders.clear();
        s.openReminders.add(reminder("Late", at(23, 59) + MINUTE_MS + 15 * MINUTE_MS));
        assertEquals("Late at 12:15 AM", plan(s, null, at(21, 50), 30).shortText);
    }

    @Test public void clockHoursFollowDaylightSaving() {
        TimeZone ny = TimeZone.getTimeZone("America/New_York");
        TodaySnapshot s = allLogged();
        s.mealTypes.remove("lunch");
        // In July a fixed offset would read this as 13:00, before lunch is overdue.
        long now = at(ny, 2026, Calendar.JULY, 1, 14, 0);
        Plan p = CheckInPlanner.plan(s, null, now, ny, 120, SLEEP_START, SLEEP_END);
        assertEquals(Topic.MEAL, p.topic);
    }

    @Test public void longReminderTitleStaysShort() {
        TodaySnapshot s = allLogged();
        char[] chars = new char[200];
        Arrays.fill(chars, 'x');
        String title = new String(chars);
        s.openReminders.add(reminder(title, at(15, 30)));
        Plan p = plan(s, at(14, 30));
        assertTrue(p.shortText.length() <= 40);
        assertEquals(title.substring(0, 24) + "… at 3:30 PM", p.shortText);
        assertTrue(p.fullText.contains(title)); // the chat message is never cut
    }

    @Test public void titleOfExactlyTheLimitIsNotCut() {
        TodaySnapshot s = allLogged();
        s.openReminders.add(reminder("123456789012345678901234", at(15, 0)));
        assertEquals("123456789012345678901234 at 3 PM", plan(s, at(14, 30)).shortText);
    }

    @Test public void cuttingNeverSplitsAnEmoji() {
        TodaySnapshot s = allLogged();
        s.openReminders.add(reminder("12345678901234567890123😀 and more", at(15, 0)));
        assertEquals("12345678901234567890123… at 3 PM", plan(s, at(14, 30)).shortText);
    }
}
