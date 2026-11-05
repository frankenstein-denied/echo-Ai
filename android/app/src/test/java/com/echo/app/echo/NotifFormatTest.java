package com.echo.app.echo;

import static org.junit.Assert.assertEquals;

import java.util.Calendar;
import java.util.Locale;
import java.util.TimeZone;
import org.junit.Test;

public class NotifFormatTest {
    private static final TimeZone TZ = TimeZone.getTimeZone("America/New_York");

    /** Epoch ms for a local wall-clock time in TZ. Month is 1-based. */
    private static long at(int y, int mo, int d, int h, int mi) {
        Calendar c = Calendar.getInstance(TZ, Locale.US);
        c.clear();
        c.set(y, mo - 1, d, h, mi, 0);
        return c.getTimeInMillis();
    }

    // Thursday 2026-11-05 12:00 local.
    private static final long NOW = at(2026, 11, 5, 12, 0);

    private static String label(long due) {
        return NotifFormat.dueLabel(due, NOW, TZ, Locale.US, false);
    }

    @Test public void laterToday() {
        assertEquals("Today 3:00 PM", label(at(2026, 11, 5, 15, 0)));
    }

    @Test public void tomorrow() {
        assertEquals("Tomorrow 9:30 AM", label(at(2026, 11, 6, 9, 30)));
    }

    @Test public void withinAWeekUsesWeekday() {
        assertEquals("Tue 9:00 AM", label(at(2026, 11, 10, 9, 0)));
    }

    @Test public void furtherOutUsesDate() {
        assertEquals("Nov 20 9:00 AM", label(at(2026, 11, 20, 9, 0)));
    }

    @Test public void overdueEarlierToday() {
        assertEquals("Overdue · Today 9:00 AM", label(at(2026, 11, 5, 9, 0)));
    }

    @Test public void overdueYesterday() {
        assertEquals("Overdue · Yesterday 8:00 PM", label(at(2026, 11, 4, 20, 0)));
    }

    @Test public void overdueEarlierThisWeekUsesWeekday() {
        assertEquals("Overdue · Tue 9:00 AM", label(at(2026, 11, 3, 9, 0)));
    }

    @Test public void overdueLongAgoUsesDate() {
        assertEquals("Overdue · Oct 1 9:00 AM", label(at(2026, 10, 1, 9, 0)));
    }

    @Test public void dueExactlyNowIsNotOverdue() {
        assertEquals("Today 12:00 PM", label(NOW));
    }

    @Test public void twentyFourHourClock() {
        assertEquals("Today 15:00", NotifFormat.dueLabel(at(2026, 11, 5, 15, 0), NOW, TZ, Locale.US, true));
    }

    @Test public void missingDueTime() {
        assertEquals("No due time", label(Long.MAX_VALUE));
        assertEquals("No due time", label(0L));
    }

    @Test public void tomorrowAcrossDstChange() {
        // US DST ends 2026-11-01; "tomorrow" must be by calendar day, not 24h.
        long now = at(2026, 10, 31, 23, 0);
        long due = at(2026, 11, 1, 23, 30);
        assertEquals("Tomorrow 11:30 PM", NotifFormat.dueLabel(due, now, TZ, Locale.US, false));
    }

    @Test public void percentRoundsAndClamps() {
        assertEquals(0, NotifFormat.percent(Double.NaN));
        assertEquals(0, NotifFormat.percent(-5));
        assertEquals(13, NotifFormat.percent(12.5));
        assertEquals(12, NotifFormat.percent(12.4));
        assertEquals(100, NotifFormat.percent(140));
        assertEquals(0, NotifFormat.percent(Double.NEGATIVE_INFINITY));
        assertEquals(100, NotifFormat.percent(Double.POSITIVE_INFINITY));
    }
}
