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
        return CheckInPlanner.plan(s, last, nowMs, TZ, everyMinutes, SLEEP_START, SLEEP_END, 0, true, true);
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

    private static final int TWO_DAYS = 2880;
    private static final long DAY_MS = 1440 * MINUTE_MS;

    @Test public void reminderDaysAheadInsideALongGapNamesItsDay() {
        long now = at(14, 30);
        TodaySnapshot s = allLogged();
        s.openReminders.add(reminder("Dentist", at(16, 0) + DAY_MS));
        Plan p = plan(s, null, now, TWO_DAYS);
        assertEquals(Topic.REMINDER, p.topic);
        assertEquals("Dentist on Sat, Nov 7", p.shortText);
        assertEquals("Hey, don't forget Dentist on Sat, Nov 7 at 4 PM.", p.fullText);
    }

    @Test public void reminderTomorrowAtAnEarlierClockTimeNamesItsDay() {
        TodaySnapshot s = allLogged();
        s.openReminders.add(reminder("Dentist", at(14, 0) + DAY_MS));
        assertEquals("Dentist on Sat, Nov 7", plan(s, null, at(14, 30), TWO_DAYS).shortText);
    }

    @Test public void reminderTomorrowExactlyTwelveHoursAwayNamesItsDay() {
        TodaySnapshot s = allLogged();
        s.openReminders.add(reminder("Dentist", at(9, 0) + DAY_MS));
        assertEquals("Dentist on Sat, Nov 7", plan(s, null, at(21, 0), TWO_DAYS).shortText);
    }

    @Test public void reminderTomorrowUnderTwelveHoursAwayKeepsTheTimeAlone() {
        TodaySnapshot s = allLogged();
        s.openReminders.add(reminder("Dentist", at(8, 59) + DAY_MS));
        assertEquals("Dentist at 8:59 AM", plan(s, null, at(21, 0), TWO_DAYS).shortText);
    }

    @Test public void reminderLaterTodayKeepsTheTimeAloneHoweverFarOff() {
        TodaySnapshot s = allLogged();
        s.openReminders.add(reminder("Dentist", at(21, 0)));
        assertEquals("Dentist at 9 PM", plan(s, null, at(7, 30), TWO_DAYS).shortText);
    }

    @Test public void reminderBeyondALongGapDoesNotCount() {
        long now = at(14, 30);
        TodaySnapshot s = allLogged();
        s.openReminders.add(reminder("Dentist", now + TWO_DAYS * MINUTE_MS + MINUTE_MS));
        assertNotEquals(Topic.REMINDER, plan(s, null, now, TWO_DAYS).topic);
    }

    @Test public void reminderTextFitsTheSmallMessageOnTheLongestDate() {
        long now = at(TZ, 2026, Calendar.SEPTEMBER, 29, 14, 30);
        long due = at(TZ, 2026, Calendar.SEPTEMBER, 30, 16, 0);
        for (String title : new String[] {"Twenty four letters long", "A very long reminder title indeed"}) {
            TodaySnapshot s = allLogged();
            s.openReminders.add(reminder(title, due));
            String text = plan(s, null, now, TWO_DAYS).shortText;
            assertTrue(text, text.endsWith(" on Wed, Sep 30"));
            assertTrue(text, text.length() <= 40);
        }
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
        assertEquals("Have you had lunch yet?", p.shortText);
    }

    @Test public void snackInTheBreakfastWindowIsConfirmedNotAskedAgain() {
        TodaySnapshot s = allLogged();
        s.mealTypes = new HashSet<>(Arrays.asList("snack"));
        s.meals.add(new TodaySnapshot.Meal("snack", "siopao", at(8, 5)));
        Plan p = plan(s, at(9, 0));
        assertEquals(Topic.MEAL, p.topic);
        assertEquals("Was the siopao your breakfast?", p.shortText);
        assertEquals("Was the siopao your breakfast?", p.fullText);
    }

    @Test public void foodLoggedJustBeforeTheWindowStillCounts() {
        TodaySnapshot s = allLogged();
        s.mealTypes = new HashSet<>(Arrays.asList("snack"));
        s.meals.add(new TodaySnapshot.Meal("", "pandesal", at(6, 30)));
        assertEquals("Was the pandesal your breakfast?", plan(s, at(8, 0)).shortText);
    }

    @Test public void morningSnackIsNotTakenForLunch() {
        TodaySnapshot s = allLogged();
        s.mealTypes = new HashSet<>(Arrays.asList("breakfast", "snack", "dinner"));
        s.meals.add(new TodaySnapshot.Meal("snack", "siopao", at(9, 0)));
        assertEquals("Have you had lunch yet?", plan(s, at(14, 30)).shortText);
    }

    @Test public void aLoggedMainMealIsNeverOfferedAsAnother() {
        TodaySnapshot s = allLogged();
        s.mealTypes = new HashSet<>(Arrays.asList("breakfast", "dinner"));
        s.meals.add(new TodaySnapshot.Meal("breakfast", "eggs", at(12, 10)));
        assertEquals("Have you had lunch yet?", plan(s, at(14, 30)).shortText);
    }

    @Test public void longFoodNamesAreLeftToTheRegularQuestion() {
        TodaySnapshot s = allLogged();
        s.mealTypes = new HashSet<>(Arrays.asList("snack"));
        s.meals.add(new TodaySnapshot.Meal("snack", "a very long description of everything eaten", at(8, 5)));
        assertNotEquals(Topic.OVERVIEW, plan(s, at(9, 0)).topic);
        assertFalse(plan(s, at(9, 0)).shortText.startsWith("Was the"));
    }

    @Test public void confirmTooLongForThePopUpUsesAShortLine() {
        TodaySnapshot s = allLogged();
        s.mealTypes = new HashSet<>(Arrays.asList("snack"));
        s.meals.add(new TodaySnapshot.Meal("snack", "chicken siopao and coffee", at(8, 5)));
        Plan p = plan(s, at(9, 0));
        assertEquals("Was that your breakfast?", p.shortText);
        assertEquals("Was the chicken siopao and coffee your breakfast?", p.fullText);
    }

    private static void assertMeal(String meal, TodaySnapshot s, int hour, int minute) {
        Plan p = plan(s, at(hour, minute));
        assertEquals(Topic.MEAL, p.topic);
        assertTrue(p.shortText, p.shortText.contains(meal));
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
        assertNotEquals(Topic.MEAL, CheckInPlanner.plan(s, null, at(0, 30), TZ, 120, 2 * 60, 7 * 60, 0, true, true).topic);
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
        assertEquals("Quick water break?", behind.shortText);

        s.waterGlasses = 4;
        assertNotEquals(Topic.WATER, plan(s, at(14, 30)).topic);
    }

    @Test public void waterPaceWithSleepThatDoesNotCrossMidnight() {
        TodaySnapshot s = allLogged();
        s.waterGlasses = 3;
        // Awake 09:00 to 01:00 is 960 minutes. At 17:00 the pace is floor(8 * 480 / 960) = 4.
        Plan p = CheckInPlanner.plan(s, null, at(17, 0), TZ, 120, 60, 9 * 60, 0, true, true);
        assertEquals(Topic.WATER, p.topic);
        s.waterGlasses = 4;
        p = CheckInPlanner.plan(s, null, at(17, 0), TZ, 120, 60, 9 * 60, 0, true, true);
        assertNotEquals(Topic.WATER, p.topic);
    }

    @Test public void waterPaceWithNoSleepTimeRunsAcrossTheWholeDay() {
        TodaySnapshot s = allLogged();
        s.waterGlasses = 3;
        // Equal times mean never asleep, so the pace runs midnight to midnight.
        assertNotEquals(Topic.WATER, CheckInPlanner.plan(s, null, at(11, 59), TZ, 120, 420, 420, 0, true, true).topic); // pace 3
        assertEquals(Topic.WATER, CheckInPlanner.plan(s, null, at(12, 0), TZ, 120, 420, 420, 0, true, true).topic); // pace 4
    }

    @Test public void unloggedEnergyIsNotAskedAtMidday() {
        TodaySnapshot s = allLogged();
        s.moodLogged = false;
        s.moodTag = null;
        s.energyLogged = false;
        s.energy = null;
        Plan p = plan(s, at(14, 30));
        assertEquals(Topic.MOOD, p.topic);
        assertEquals("How's your day going so far?", p.shortText);
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
        assertEquals("You're close to your food goal.", p.shortText);

        s.kcalToday = 1799;
        assertNotEquals(Topic.CALORIES, plan(s, at(14, 30)).topic);
    }

    @Test public void doesNotRepeatTopic() {
        TodaySnapshot s = allLogged();
        s.moodLogged = false;
        s.waterGlasses = 0;
        Plan p = plan(s, Topic.WATER, at(14, 30), 120);
        assertEquals(Topic.MOOD, p.topic);
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
        assertEquals("How's the afternoon going?", p.shortText);
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
        assertEquals("Hey, have you had lunch yet? What did you get?", p.fullText);
    }

    @Test public void timesUseThePhonesTimeZone() {
        TodaySnapshot s = allLogged();
        long now = at(14, 30);
        s.openReminders.add(reminder("Dentist", at(15, 0)));
        TimeZone tokyo = TimeZone.getTimeZone("Asia/Tokyo"); // one hour ahead of Manila
        Plan p = CheckInPlanner.plan(s, null, now, tokyo, 120, SLEEP_START, SLEEP_END, 0, true, true);
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
        Plan p = CheckInPlanner.plan(s, null, now, ny, 120, SLEEP_START, SLEEP_END, 0, true, true);
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

    // ---- the voice ----

    private static final String LONG_NAME = "Maximiliana Alexandrina Featherstonehaugh-Cholmondeley";
    private static final int GAP = 120;

    private static Plan voiced(TodaySnapshot s, long nowMs, int step) {
        return CheckInPlanner.plan(s, null, nowMs, TZ, GAP, SLEEP_START, SLEEP_END, step * GAP, true, true);
    }

    /** One snapshot and time for every list of lines. */
    private static Object[][] everySituation() {
        TodaySnapshot breakfast = allLogged();
        breakfast.mealTypes.remove("breakfast");
        TodaySnapshot lunch = allLogged();
        lunch.mealTypes.remove("lunch");
        TodaySnapshot dinner = allLogged();
        dinner.mealTypes.remove("dinner");
        TodaySnapshot noWater = allLogged();
        noWater.waterGlasses = 0;
        TodaySnapshot someWater = allLogged();
        someWater.waterGlasses = 2;
        TodaySnapshot halfWater = allLogged();
        halfWater.waterGlasses = 5;
        TodaySnapshot mood = allLogged();
        mood.moodLogged = false;
        TodaySnapshot foodNear = allLogged();
        foodNear.calorieGoal = 2000;
        foodNear.kcalToday = 1900;
        TodaySnapshot foodReached = allLogged();
        foodReached.calorieGoal = 2000;
        foodReached.kcalToday = 2300;
        TodaySnapshot reminderToday = allLogged();
        reminderToday.openReminders.add(reminder("Dentist", at(15, 30)));
        return new Object[][] {
            {breakfast, at(8, 0), Topic.MEAL}, {lunch, at(13, 0), Topic.MEAL}, {dinner, at(19, 0), Topic.MEAL},
            {noWater, at(15, 0), Topic.WATER}, {someWater, at(15, 0), Topic.WATER}, {halfWater, at(20, 0), Topic.WATER},
            {mood, at(15, 0), Topic.MOOD},
            {foodNear, at(15, 0), Topic.CALORIES}, {foodReached, at(15, 0), Topic.CALORIES},
            {reminderToday, at(14, 30), Topic.REMINDER},
            {allLogged(), at(9, 0), Topic.OVERVIEW}, {allLogged(), at(15, 0), Topic.OVERVIEW}, {allLogged(), at(20, 0), Topic.OVERVIEW},
        };
    }

    @Test public void noMessageReadsLikeStats() {
        String[] banned = {"0 of", "not logged", "kcal", "So far today", "Next up", "log", "track", "{"};
        for (Object[] c : everySituation()) {
            for (int step = 0; step < 3; step++) {
                TodaySnapshot s = (TodaySnapshot) c[0];
                s.preferredName = "Sam";
                Plan p = voiced(s, (Long) c[1], step);
                assertEquals(c[2], p.topic);
                for (String word : banned) {
                    assertFalse(p.fullText, p.fullText.contains(word));
                    assertFalse(p.shortText, p.shortText.contains(word));
                }
            }
        }
    }

    @Test public void everyShortTextFitsEvenWithALongName() {
        for (Object[] c : everySituation()) {
            for (int step = 0; step < 3; step++) {
                TodaySnapshot s = (TodaySnapshot) c[0];
                s.preferredName = LONG_NAME;
                String text = voiced(s, (Long) c[1], step).shortText;
                assertTrue(text, text.length() <= 40);
            }
        }
    }

    @Test public void consecutiveCheckInsUseDifferentLines() {
        for (Object[] c : everySituation()) {
            TodaySnapshot s = (TodaySnapshot) c[0];
            long now = (Long) c[1];
            assertNotEquals(voiced(s, now, 0).fullText, voiced(s, now, 1).fullText);
            assertNotEquals(voiced(s, now, 1).fullText, voiced(s, now, 2).fullText);
            assertNotEquals(voiced(s, now, 0).fullText, voiced(s, now, 2).fullText);
        }
    }

    @Test public void aFewMinutesLateStillMovesToTheNextLine() {
        TodaySnapshot s = allLogged();
        s.moodLogged = false;
        int base = 29_000_040; // a multiple of the gap, as a real minute count would be on the grid
        String first = CheckInPlanner.plan(s, null, at(15, 0), TZ, GAP, SLEEP_START, SLEEP_END, base + 2, true, true).fullText;
        String next = CheckInPlanner.plan(s, null, at(15, 0), TZ, GAP, SLEEP_START, SLEEP_END, base + GAP + 3, true, true).fullText;
        assertNotEquals(first, next);
    }

    @Test public void theSameSeedGivesTheSameLine() {
        TodaySnapshot s = allLogged();
        assertEquals(voiced(s, at(15, 0), 7).fullText, voiced(s, at(15, 0), 7).fullText);
    }

    @Test public void theNameIsUsedOnlyWhenSet() {
        TodaySnapshot s = allLogged();
        s.moodLogged = false;
        assertEquals("Hey, how are you feeling right now?", voiced(s, at(15, 0), 1).fullText);
        s.preferredName = "   ";
        assertEquals("Hey, how are you feeling right now?", voiced(s, at(15, 0), 1).fullText);
        s.preferredName = "Sam";
        assertEquals("Hey, Sam, how are you feeling right now?", voiced(s, at(15, 0), 1).fullText);
        assertFalse(voiced(s, at(15, 0), 1).shortText.contains("Sam"));
    }

    @Test public void theNameComesUpAboutOneTimeInThree() {
        TodaySnapshot s = allLogged();
        s.moodLogged = false;
        s.preferredName = "Sam";
        int named = 0;
        for (int step = 0; step < 30; step++) {
            if (voiced(s, at(15, 0), step).fullText.contains("Sam")) named++;
        }
        assertEquals(10, named);
    }

    @Test public void waterWordingFollowsHowFarAlong() {
        TodaySnapshot s = allLogged();
        s.waterGlasses = 0;
        assertEquals("Have you had any water today? Go grab a glass for me.", plan(s, at(15, 0)).fullText);
        s.waterGlasses = 2;
        assertEquals("Quick water break? You're doing well so far.", plan(s, at(15, 0)).fullText);
        s.waterGlasses = 5;
        assertEquals("You're over halfway to your water goal. One more glass?", plan(s, at(20, 0)).fullText);
    }

    @Test public void foodGoalWordingNeverCallsAnOverGoalDayClose() {
        TodaySnapshot s = allLogged();
        s.calorieGoal = 2000;
        s.kcalToday = 1900;
        assertEquals("You've eaten pretty well today, you're close to your goal.", plan(s, at(15, 0)).fullText);
        s.kcalToday = 2300;
        assertEquals("You've reached your food goal for today. How are you feeling?", plan(s, at(15, 0)).fullText);
    }

    @Test public void nothingMissingFollowsThePartOfTheDay() {
        assertEquals("Hope your morning's going well. Anything on your mind?", plan(allLogged(), at(11, 59)).fullText);
        assertEquals("How's the afternoon going? Tell me something good.", plan(allLogged(), at(12, 0)).fullText);
        assertEquals("How's the afternoon going? Tell me something good.", plan(allLogged(), at(17, 59)).fullText);
        assertEquals("How was your day? I'd love to hear about it.", plan(allLogged(), at(18, 0)).fullText);
    }

    @Test public void reminderLinesNameTheTitleAndTime() {
        TodaySnapshot s = allLogged();
        s.openReminders.add(reminder("Dentist", at(15, 30)));
        assertEquals("Hey, don't forget Dentist at 3:30 PM.", voiced(s, at(14, 30), 0).fullText);
        assertEquals("Just a heads up: Dentist at 3:30 PM.", voiced(s, at(14, 30), 1).fullText);
        assertEquals("Hey, Dentist is coming up at 3:30 PM.", voiced(s, at(14, 30), 2).fullText);
    }
}
