package com.echo.app.floating;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class ChatheadGeometryTest {
    @Test public void snapsToNearestSideEdge() {
        assertEquals(0, ChatheadGeometry.snapX(100, 50, 1000));
        assertEquals(950, ChatheadGeometry.snapX(800, 50, 1000));
    }

    @Test public void tapIsShortAndStill() {
        assertTrue(ChatheadGeometry.isTap(2, 2, 100, 10));
        assertFalse(ChatheadGeometry.isTap(40, 0, 100, 10)); // moved: a drag
        assertFalse(ChatheadGeometry.isTap(2, 2, 900, 10));  // held: not a tap
    }

    @Test public void removeTargetHitTest() {
        assertTrue(ChatheadGeometry.overRemoveTarget(500, 1800, 500, 1810, 80));
        assertFalse(ChatheadGeometry.overRemoveTarget(100, 900, 500, 1810, 80));
    }

    @Test public void clampsY() {
        assertEquals(0, ChatheadGeometry.clampY(-40, 50, 2000));
        assertEquals(1950, ChatheadGeometry.clampY(2500, 50, 2000));
    }

    @Test public void panelWindowIsFocusable() {
        // focusable so the keyboard works
        assertEquals(0, ChatheadGeometry.panelFlags() & ChatheadGeometry.FLAG_NOT_FOCUSABLE);
    }
}
