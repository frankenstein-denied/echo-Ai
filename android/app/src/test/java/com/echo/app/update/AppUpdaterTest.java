package com.echo.app.update;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class AppUpdaterTest {
    @Test public void checksOnEveryOpenWhenNothingIsUnderWay() {
        assertTrue(AppUpdater.shouldCheck(false, false, false, false));
    }

    @Test public void neverStacksOrInterruptsAnUpdate() {
        assertFalse(AppUpdater.shouldCheck(true, false, false, false));
        assertFalse(AppUpdater.shouldCheck(false, true, false, false));
        assertFalse(AppUpdater.shouldCheck(false, false, true, false));
        assertFalse(AppUpdater.shouldCheck(false, false, false, true));
    }
}
