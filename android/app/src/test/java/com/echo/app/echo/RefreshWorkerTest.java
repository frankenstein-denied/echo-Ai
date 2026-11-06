package com.echo.app.echo;

import static org.junit.Assert.*;

import org.junit.Test;

public class RefreshWorkerTest {
    private static CheckInPrefs prefs(boolean enabled) {
        CheckInPrefs p = CheckInPrefs.defaults();
        p.enabled = enabled;
        return p;
    }

    @Test public void pinnedAlwaysNeedsTheWorker() {
        assertTrue(RefreshWorker.needed(true, false, null));
        assertTrue(RefreshWorker.needed(true, true, prefs(false)));
    }

    @Test public void checkInsNeedTheWorkerOnlyWhenSignedInAndOn() {
        assertTrue(RefreshWorker.needed(false, true, prefs(true)));
        assertFalse(RefreshWorker.needed(false, false, prefs(true)));
        assertFalse(RefreshWorker.needed(false, true, prefs(false)));
        assertFalse(RefreshWorker.needed(false, true, null));
    }
}
