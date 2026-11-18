package com.echo.app.floating;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import com.echo.app.floating.ChatheadMood.Look;
import java.util.Calendar;
import java.util.TimeZone;
import org.junit.Test;

public class ChatheadMoodTest {
    private static final TimeZone TZ = TimeZone.getTimeZone("Asia/Manila");
    private static final int SLEEP = 22 * 60;
    private static final int WAKE = 7 * 60;
    private static final long MIN = 60_000L;

    private static long at(int hour, int minute) {
        Calendar c = Calendar.getInstance(TZ);
        c.clear();
        c.set(2026, Calendar.NOVEMBER, 19, hour, minute, 0);
        return c.getTimeInMillis();
    }

    private static Look look(long now, long rainUntil) {
        return ChatheadMood.look(now, TZ, SLEEP, WAKE, rainUntil);
    }

    @Test public void plainDayIsTheNormalHead() {
        assertEquals(Look.NORMAL, look(at(14, 0), 0));
    }

    @Test public void rainComingWearsTheUmbrella() {
        assertEquals(Look.UMBRELLA, look(at(14, 0), at(16, 0)));
    }

    @Test public void rainThatHasPassedTakesItOff() {
        assertEquals(Look.NORMAL, look(at(14, 0), at(13, 59)));
    }

    @Test public void theHourBeforeBedYawns() {
        assertEquals(Look.YAWN, look(at(21, 0), 0));
        assertEquals(Look.YAWN, look(at(21, 59), 0));
        assertEquals(Look.NORMAL, look(at(20, 59), 0));
    }

    @Test public void yawnBeatsTheUmbrella() {
        assertEquals(Look.YAWN, look(at(21, 30), at(23, 0)));
    }

    @Test public void bedtimeAfterMidnightStillYawnsTheHourBefore() {
        assertEquals(Look.YAWN, ChatheadMood.look(at(0, 30), TZ, 60, WAKE, 0));
        assertEquals(Look.NORMAL, ChatheadMood.look(at(23, 30), TZ, 60, WAKE, 0));
    }

    @Test public void neverAsleepNeverYawns() {
        assertEquals(Look.NORMAL, ChatheadMood.look(at(21, 30), TZ, SLEEP, SLEEP, 0));
    }

    @Test public void bobsOnlyToFreshMusicWhileAwake() {
        long now = at(14, 0);
        assertTrue(ChatheadMood.bobs(true, now - 5 * MIN, now, false));
        assertFalse(ChatheadMood.bobs(false, now - 5 * MIN, now, false));
        assertFalse("dozing", ChatheadMood.bobs(true, now - 5 * MIN, now, true));
        assertFalse("a report left behind by a closed app", ChatheadMood.bobs(true, now - ChatheadMood.MUSIC_FRESH_MS - 1, now, false));
    }
}
