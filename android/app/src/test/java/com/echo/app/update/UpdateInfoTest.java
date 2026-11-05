package com.echo.app.update;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class UpdateInfoTest {
    @Test
    public void parsesPublishedVersion() {
        UpdateInfo u = UpdateInfo.parse("{\"versionCode\":3,\"versionName\":\"1.2\",\"notes\":\"Mic fix\"}");
        assertEquals(3, u.versionCode);
        assertEquals("1.2", u.versionName);
        assertEquals("Mic fix", u.notes);
    }

    @Test
    public void defaultsNameAndNotes() {
        UpdateInfo u = UpdateInfo.parse("{\"versionCode\":4}");
        assertEquals("4", u.versionName);
        assertEquals("", u.notes);
    }

    @Test
    public void rejectsMissingOrBadInput() {
        assertNull(UpdateInfo.parse(null));
        assertNull(UpdateInfo.parse("not json"));
        assertNull(UpdateInfo.parse("{}"));
        assertNull(UpdateInfo.parse("{\"versionCode\":0}"));
    }

    @Test
    public void comparesWithInstalledVersion() {
        UpdateInfo u = UpdateInfo.parse("{\"versionCode\":3}");
        assertTrue(u.isNewerThan(2));
        assertFalse(u.isNewerThan(3));
        assertFalse(u.isNewerThan(4));
    }
}
