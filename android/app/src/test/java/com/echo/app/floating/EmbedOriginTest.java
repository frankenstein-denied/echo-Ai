package com.echo.app.floating;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class EmbedOriginTest {
    @Test public void allowsLiveSiteHttps() {
        assertTrue(EmbedOrigin.isAllowed("https://echo-ai-blue.vercel.app/?embed=chat"));
    }

    @Test public void rejectsHttp() {
        assertFalse(EmbedOrigin.isAllowed("http://echo-ai-blue.vercel.app/"));
    }

    @Test public void rejectsLookalikeHosts() {
        assertFalse(EmbedOrigin.isAllowed("https://echo-ai-blue.vercel.app.evil.example/"));
        assertFalse(EmbedOrigin.isAllowed("https://evil.example/?u=echo-ai-blue.vercel.app"));
        assertFalse(EmbedOrigin.isAllowed("https://user@evil.example@echo-ai-blue.vercel.app/"));
    }

    @Test public void rejectsNullAndGarbage() {
        assertFalse(EmbedOrigin.isAllowed(null));
        assertFalse(EmbedOrigin.isAllowed("not a url"));
    }
}
