package com.echo.app.echo;

import org.json.JSONException;
import org.json.JSONObject;

/** Check-in settings read from the profile. Starts at the same defaults as the web's resolveCheckInSettings. */
public final class CheckInPrefs {
    public boolean enabled = true;
    public int everyMinutes = 120;
    public int sleepStartMin = 22 * 60;
    public int sleepEndMin = 7 * 60;
    public int waterGoal = 8;
    public boolean caloriesEnabled = true;
    public Integer calorieGoal;
    public boolean onboarded;
    public String preferredName;

    public static CheckInPrefs defaults() {
        return new CheckInPrefs();
    }

    /**
     * What the bridge sends, laid over the cached prefs. The bridge carries only the settings, so everything
     * else comes from the cache, and a bad value keeps the cached one. Leaves the cached copy untouched.
     */
    public static CheckInPrefs merged(CheckInPrefs cached, boolean enabled, int everyMinutes,
                                      String sleepStart, String sleepEnd, int waterGoal) {
        CheckInPrefs p = new CheckInPrefs();
        p.enabled = enabled;
        p.everyMinutes = FirestoreJson.isCheckInGap(everyMinutes) ? everyMinutes : cached.everyMinutes;
        p.sleepStartMin = FirestoreJson.clockMinutes(sleepStart, cached.sleepStartMin);
        p.sleepEndMin = FirestoreJson.clockMinutes(sleepEnd, cached.sleepEndMin);
        p.waterGoal = FirestoreJson.isWaterGoal(waterGoal) ? waterGoal : cached.waterGoal;
        p.caloriesEnabled = cached.caloriesEnabled;
        p.calorieGoal = cached.calorieGoal;
        p.onboarded = cached.onboarded;
        p.preferredName = cached.preferredName;
        return p;
    }

    /** The form kept in SessionStore's cachedPrefsJson. */
    public String toJson() {
        try {
            JSONObject o = new JSONObject()
                .put("enabled", enabled)
                .put("everyMinutes", everyMinutes)
                .put("sleepStartMin", sleepStartMin)
                .put("sleepEndMin", sleepEndMin)
                .put("waterGoal", waterGoal)
                .put("caloriesEnabled", caloriesEnabled)
                .put("onboarded", onboarded);
            if (calorieGoal != null) o.put("calorieGoal", calorieGoal.intValue());
            if (preferredName != null) o.put("preferredName", preferredName);
            return o.toString();
        } catch (JSONException e) {
            throw new IllegalStateException(e);
        }
    }

    /** Reads {@link #toJson} back. Null when nothing usable is cached. */
    public static CheckInPrefs fromJson(String json) {
        if (json == null || json.isEmpty()) return null;
        try {
            JSONObject o = new JSONObject(json);
            CheckInPrefs p = new CheckInPrefs();
            p.enabled = o.getBoolean("enabled");
            p.everyMinutes = o.getInt("everyMinutes");
            p.sleepStartMin = o.getInt("sleepStartMin");
            p.sleepEndMin = o.getInt("sleepEndMin");
            p.waterGoal = o.getInt("waterGoal");
            p.caloriesEnabled = o.getBoolean("caloriesEnabled");
            p.onboarded = o.getBoolean("onboarded");
            if (o.has("calorieGoal")) p.calorieGoal = o.getInt("calorieGoal");
            if (o.has("preferredName")) p.preferredName = o.getString("preferredName");
            return p;
        } catch (JSONException e) {
            return null;
        }
    }
}
