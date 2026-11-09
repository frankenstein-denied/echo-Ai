package com.echo.app.echo;

import static org.junit.Assert.*;

import org.junit.Test;

public class CheckInPrefsTest {
    @Test public void jsonRoundTripKeepsEveryField() {
        CheckInPrefs p = new CheckInPrefs();
        p.enabled = false;
        p.everyMinutes = 30;
        p.sleepStartMin = 1400;
        p.sleepEndMin = 365;
        p.waterGoal = 12;
        p.caloriesEnabled = false;
        p.calorieGoal = 1800;
        p.onboarded = true;
        p.preferredName = "Sam";
        p.language = "fil";
        CheckInPrefs back = CheckInPrefs.fromJson(p.toJson());
        assertEquals("Sam", back.preferredName);
        assertEquals("fil", back.language);
        assertFalse(back.enabled);
        assertEquals(30, back.everyMinutes);
        assertEquals(1400, back.sleepStartMin);
        assertEquals(365, back.sleepEndMin);
        assertEquals(12, back.waterGoal);
        assertFalse(back.caloriesEnabled);
        assertEquals(Integer.valueOf(1800), back.calorieGoal);
        assertTrue(back.onboarded);
    }

    @Test public void jsonRoundTripKeepsAnUnsetCalorieGoal() {
        assertNull(CheckInPrefs.fromJson(CheckInPrefs.defaults().toJson()).calorieGoal);
    }

    @Test public void unreadableJsonIsNoCachedPrefs() {
        assertNull(CheckInPrefs.fromJson(null));
        assertNull(CheckInPrefs.fromJson(""));
        assertNull(CheckInPrefs.fromJson("not json"));
    }

    @Test public void defaultsAreNotOnboarded() {
        assertFalse(CheckInPrefs.defaults().onboarded);
    }

    @Test public void settingsMergeKeepsWhatTheBridgeDoesNotCarry() {
        CheckInPrefs cached = CheckInPrefs.defaults();
        cached.onboarded = true;
        cached.caloriesEnabled = false;
        cached.calorieGoal = 2000;
        cached.preferredName = "Sam";
        cached.language = "ceb";
        CheckInPrefs m = CheckInPrefs.merged(cached, false, 60, "23:30", "06:15", 10);
        assertEquals("Sam", m.preferredName);
        assertEquals("ceb", m.language);
        assertFalse(m.enabled);
        assertEquals(60, m.everyMinutes);
        assertEquals(23 * 60 + 30, m.sleepStartMin);
        assertEquals(6 * 60 + 15, m.sleepEndMin);
        assertEquals(10, m.waterGoal);
        assertTrue(m.onboarded);
        assertFalse(m.caloriesEnabled);
        assertEquals(Integer.valueOf(2000), m.calorieGoal);
        assertTrue(cached.enabled);
    }

    @Test public void settingsMergeTakesAnyGapInRange() {
        for (int gap : new int[] {5, 45, 2880, 43200}) {
            assertEquals(gap, CheckInPrefs.merged(CheckInPrefs.defaults(), true, gap, "22:00", "07:00", 8).everyMinutes);
        }
        CheckInPrefs cached = CheckInPrefs.defaults();
        cached.everyMinutes = 60;
        assertEquals(60, CheckInPrefs.merged(cached, true, 43201, "22:00", "07:00", 8).everyMinutes);
    }

    @Test public void settingsMergeIgnoresBadValues() {
        CheckInPrefs cached = CheckInPrefs.defaults();
        cached.everyMinutes = 60;
        cached.sleepStartMin = 100;
        cached.sleepEndMin = 200;
        cached.waterGoal = 5;
        CheckInPrefs m = CheckInPrefs.merged(cached, true, 0, "25:00", "7:00", 31);
        assertEquals(60, m.everyMinutes);
        assertEquals(100, m.sleepStartMin);
        assertEquals(200, m.sleepEndMin);
        assertEquals(5, m.waterGoal);
    }
}
