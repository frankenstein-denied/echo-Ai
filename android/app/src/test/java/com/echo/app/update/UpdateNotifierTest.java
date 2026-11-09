package com.echo.app.update;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class UpdateNotifierTest {
    private static final long HOUR = 60 * 60_000L;
    private static final long T = 1_800_000_000_000L;

    @Test public void checksWhenNeverCheckedBefore() {
        assertTrue(UpdateNotifier.checkDue(0, 0));
    }

    @Test public void waitsSixHoursBetweenChecks() {
        assertFalse(UpdateNotifier.checkDue(T, T - 5 * HOUR));
        assertTrue(UpdateNotifier.checkDue(T, T - 6 * HOUR));
    }

    @Test public void checksWhenTheClockWentBackwards() {
        assertTrue(UpdateNotifier.checkDue(T, T + HOUR));
    }

    @Test public void notifiesOnceForEachNewerVersion() {
        assertTrue(UpdateNotifier.shouldNotify(15, 16, 0));
        assertFalse(UpdateNotifier.shouldNotify(15, 16, 16));
        assertFalse(UpdateNotifier.shouldNotify(16, 16, 0));
    }

    @Test public void cancelsOnceThatVersionIsInstalled() {
        assertTrue(UpdateNotifier.shouldCancel(16, 16));
        assertFalse(UpdateNotifier.shouldCancel(15, 16));
        assertFalse(UpdateNotifier.shouldCancel(16, 0));
    }
}
