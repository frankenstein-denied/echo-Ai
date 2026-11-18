package com.echo.app.floating;

import static org.junit.Assert.assertEquals;

import androidx.core.app.NotificationManagerCompat;
import org.junit.Test;

public class CheckInNotifierTest {
    @Test public void aFreshInstallGetsHeadsUpChimes() {
        assertEquals(NotificationManagerCompat.IMPORTANCE_HIGH, CheckInNotifier.chimeImportance(null));
    }

    @Test public void checkInsTurnedOffStayOff() {
        assertEquals(NotificationManagerCompat.IMPORTANCE_NONE,
            CheckInNotifier.chimeImportance(NotificationManagerCompat.IMPORTANCE_NONE));
    }

    @Test public void silencedCheckInsStaySilent() {
        assertEquals(NotificationManagerCompat.IMPORTANCE_LOW,
            CheckInNotifier.chimeImportance(NotificationManagerCompat.IMPORTANCE_LOW));
        assertEquals(NotificationManagerCompat.IMPORTANCE_DEFAULT,
            CheckInNotifier.chimeImportance(NotificationManagerCompat.IMPORTANCE_DEFAULT));
    }

    @Test public void neverLouderThanHeadsUp() {
        assertEquals(NotificationManagerCompat.IMPORTANCE_HIGH,
            CheckInNotifier.chimeImportance(NotificationManagerCompat.IMPORTANCE_MAX));
    }
}
