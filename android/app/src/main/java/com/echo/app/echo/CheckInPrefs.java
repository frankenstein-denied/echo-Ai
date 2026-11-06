package com.echo.app.echo;

/** Check-in settings read from the profile. Starts at the same defaults as the web's resolveCheckInSettings. */
public final class CheckInPrefs {
    public boolean enabled = true;
    public int everyMinutes = 120;
    public int sleepStartMin = 22 * 60;
    public int sleepEndMin = 7 * 60;
    public int waterGoal = 8;
    public boolean caloriesEnabled = true;
    public Integer calorieGoal;

    public static CheckInPrefs defaults() {
        return new CheckInPrefs();
    }
}
