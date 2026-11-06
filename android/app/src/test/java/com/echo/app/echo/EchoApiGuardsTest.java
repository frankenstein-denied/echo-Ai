package com.echo.app.echo;

import static org.junit.Assert.*;

import android.content.Context;
import android.content.ContextWrapper;
import java.util.TimeZone;
import org.junit.Test;

/** The guards answer before any storage or network, so a bare context is enough. */
public class EchoApiGuardsTest {
    private static EchoApi api() {
        return new EchoApi(new ContextWrapper(null) {
            @Override public Context getApplicationContext() { return this; }
        });
    }

    private static final TimeZone TZ = TimeZone.getTimeZone("UTC");

    @Test public void loadTodayWithoutPrefsIsAFailureNotACrash() {
        assertNull(api().loadToday(null, TZ));
    }

    @Test public void loadTodayWithoutTimeZoneIsAFailureNotACrash() {
        assertNull(api().loadToday(CheckInPrefs.defaults(), null));
    }

    @Test public void writeCheckInRefusesTextThatCouldNeverBeWritten() {
        assertFalse(api().writeCheckIn("m1", null, TZ));
        assertFalse(api().writeCheckIn("m1", "", TZ));
    }

    @Test public void writeCheckInWithoutTimeZoneFails() {
        assertFalse(api().writeCheckIn("m1", "Hi", null));
    }
}
