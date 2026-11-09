package com.echo.app.update;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertTrue;

import android.content.Intent;
import com.echo.app.echo.NotificationRenderer;
import org.junit.Test;

public class UpdateNotifierTest {
    private static final long HOUR = 60 * 60_000L;
    private static final long T = 1_800_000_000_000L;

    @Test public void checksWhenNeverCheckedBefore() {
        assertTrue(UpdateNotifier.checkDue(0, 0));
    }

    @Test public void waitsFiveHoursBetweenChecks() {
        assertFalse(UpdateNotifier.checkDue(T, T - 5 * HOUR + 60_000L));
        assertTrue(UpdateNotifier.checkDue(T, T - 5 * HOUR));
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

    @Test public void neverSharesTheIdOfThePinnedNotification() {
        assertNotEquals(NotificationRenderer.NOTIFICATION_ID, UpdateNotifier.NOTIFICATION_ID);
    }

    @Test public void startsTheUpdateOnlyFromAFreshTap() {
        assertTrue(UpdateNotifier.shouldStartUpdate(true, 0, false));
        assertFalse(UpdateNotifier.shouldStartUpdate(false, 0, false));
        assertFalse(UpdateNotifier.shouldStartUpdate(true, 0, true));
        assertFalse(UpdateNotifier.shouldStartUpdate(true, Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY, false));
    }
}
