package com.echo.app.floating;

import com.echo.app.echo.Reminder;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** What Echo knows about today, cached so that firing a check-in only reads memory. */
public final class TodaySnapshot {
    public String dateKey;
    public long fetchedAtMs;
    public int waterGlasses;
    public boolean moodLogged;
    public boolean energyLogged;
    public boolean caloriesEnabled;
    public String energy;
    public String moodTag;
    /** The older 1-10 mood score, or null. */
    public Integer mood;
    /** Last night's sleep, or null when not logged. */
    public Integer sleepMinutes;
    public int kcalToday;
    public Integer calorieGoal;
    public Set<String> mealTypes = new HashSet<>();
    public List<Reminder> openReminders = new ArrayList<>();
    public int waterGoal = 8;
    public String preferredName;
}
