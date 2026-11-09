package com.echo.app.echo;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class PermissionAskTest {
    @Test public void grantedCanAlwaysAsk() {
        assertTrue(EchoBridgePlugin.canAsk(true, true, false));
    }

    @Test public void neverAskedCanAsk() {
        assertTrue(EchoBridgePlugin.canAsk(false, false, false));
    }

    @Test public void deniedOnceWithRationaleCanAsk() {
        assertTrue(EchoBridgePlugin.canAsk(false, true, true));
    }

    @Test public void deniedForGoodCannotAsk() {
        assertFalse(EchoBridgePlugin.canAsk(false, true, false));
    }
}
