package com.echo.app.floating;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;

import com.echo.app.echo.ChatLine;
import com.echo.app.echo.CheckInPrefs;
import com.echo.app.echo.Goal;
import com.echo.app.echo.Reminder;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.List;
import java.util.TimeZone;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

public class SmartCheckInsTest {
    private static final TimeZone TZ = TimeZone.getTimeZone("Asia/Manila");

    private static long at(int day, int hour, int minute) {
        Calendar c = Calendar.getInstance(TZ);
        c.clear();
        c.set(2026, Calendar.NOVEMBER, day, hour, minute, 0);
        return c.getTimeInMillis();
    }

    @Test public void whenAlwaysSaysHowFarOff() {
        long now = at(9, 14, 0);
        assertEquals("in 20 min, at 2:20 PM", SmartCheckIns.when(at(9, 14, 20), now, TZ));
        assertEquals("in 2 h, today at 4 PM", SmartCheckIns.when(at(9, 16, 0), now, TZ));
        assertEquals("in 2 h 30 min, today at 4:30 PM", SmartCheckIns.when(at(9, 16, 30), now, TZ));
        assertEquals("in 19 h, tomorrow at 9 AM", SmartCheckIns.when(at(10, 9, 0), now, TZ));
    }

    @Test public void requestCarriesChatTimesMealsAndReminderDistance() throws Exception {
        TodaySnapshot s = new TodaySnapshot();
        s.caloriesEnabled = true;
        s.mealTypes.add("snack");
        s.meals.add(new TodaySnapshot.Meal("snack", "siopao", at(9, 8, 5)));
        long now = at(9, 14, 0);
        s.openReminders.add(new Reminder("r1", "Sleep", at(9, 16, 0), false));
        List<ChatLine> chat = new ArrayList<>();
        chat.add(new ChatLine(true, "I ate siopao", false, at(9, 8, 4)));
        chat.add(new ChatLine(false, "How's your afternoon?", true, at(9, 12, 0)));

        JSONObject o = new JSONObject(SmartCheckIns.buildRequest(CheckInPrefs.defaults(), s, CheckInPlanner.Topic.OVERVIEW,
            now, TZ, chat, new ArrayList<Goal>(), null));

        JSONObject msg = o.getJSONArray("messages").getJSONObject(0);
        assertEquals("I ate siopao", msg.getString("text"));
        assertEquals("8:04 AM", msg.getString("time"));
        assertEquals(1, o.getJSONArray("messages").length()); // the check-in goes to recentCheckIns
        JSONObject meal = o.getJSONObject("meals").getJSONArray("items").getJSONObject(0);
        assertEquals("siopao", meal.getString("food"));
        assertEquals("snack", meal.getString("type"));
        assertEquals("8:05 AM", meal.getString("time"));
        JSONObject r = o.getJSONArray("reminders").getJSONObject(0);
        assertEquals("in 2 h, today at 4 PM", r.getString("when"));
        assertEquals(120, r.getInt("minutesAway"));
    }

    @Test public void requestKeepsTheNewest16ChatLines() throws Exception {
        List<ChatLine> chat = new ArrayList<>();
        for (int i = 0; i < 20; i++) chat.add(new ChatLine(true, "m" + i, false));
        JSONObject o = new JSONObject(SmartCheckIns.buildRequest(CheckInPrefs.defaults(), new TodaySnapshot(),
            CheckInPlanner.Topic.OVERVIEW, at(9, 14, 0), TZ, chat, new ArrayList<Goal>(), null));
        JSONArray messages = o.getJSONArray("messages");
        assertEquals(SmartCheckIns.CHAT_LINES, messages.length());
        assertEquals("m4", messages.getJSONObject(0).getString("text"));
        assertFalse(messages.getJSONObject(0).has("time"));
    }
}
