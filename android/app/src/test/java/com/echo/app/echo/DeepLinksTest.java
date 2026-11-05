package com.echo.app.echo;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import org.junit.Test;

public class DeepLinksTest {
    private static final String BASE = "https://echo-ai-blue.vercel.app";

    @Test public void joinsPathToBase() {
        assertEquals(BASE + "/?view=Goals&goal=abc", DeepLinks.resolve(BASE, "/?view=Goals&goal=abc"));
    }

    @Test public void stripsTrailingSlashFromBase() {
        assertEquals(BASE + "/?view=Diary", DeepLinks.resolve(BASE + "/", "/?view=Diary"));
    }

    @Test public void fallsBackToLiveSiteWhenBaseMissing() {
        assertEquals(BASE + "/?view=Diary", DeepLinks.resolve(null, "/?view=Diary"));
        assertEquals(BASE + "/?view=Diary", DeepLinks.resolve("  ", "/?view=Diary"));
    }

    @Test public void rejectsUnsafePaths() {
        assertNull(DeepLinks.resolve(BASE, null));
        assertNull(DeepLinks.resolve(BASE, ""));
        assertNull(DeepLinks.resolve(BASE, "javascript:alert(1)"));
        assertNull(DeepLinks.resolve(BASE, "https://evil.example/"));
        assertNull(DeepLinks.resolve(BASE, "//evil.example/"));
        assertNull(DeepLinks.resolve(BASE, "/\\evil.example"));
        assertNull(DeepLinks.resolve(BASE, "/a b"));
        assertNull(DeepLinks.resolve(BASE, "/a\nb"));
        assertNull(DeepLinks.resolve(BASE, "/@evil.example"));
    }

    @Test public void rejectsPathsOutsideViewLinks() {
        assertNull(DeepLinks.resolveViewPath(BASE, "/"));
        assertNull(DeepLinks.resolveViewPath(BASE, "/api/secret"));
        assertNull(DeepLinks.resolveViewPath(BASE, "/login?view=Goals"));
        assertNull(DeepLinks.resolveViewPath(BASE, "//evil.example/?view=x"));
        assertNull(DeepLinks.resolveViewPath(BASE, null));
        assertEquals(BASE + "/?view=Reminders", DeepLinks.resolveViewPath(BASE, DeepLinks.REMINDERS));
        assertEquals(BASE + "/?view=Goals&goal=abc", DeepLinks.resolveViewPath(BASE, "/?view=Goals&goal=abc"));
    }

    @Test public void goalPathEncodesId() {
        assertEquals("/?view=Goals&goal=a%26b%3Dc", DeepLinks.goalPath("a&b=c"));
        assertEquals("/?view=Goals&goal=abc123", DeepLinks.goalPath("abc123"));
    }
}
