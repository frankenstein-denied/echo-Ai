package com.echo.app.floating;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

public class CallPhaseLabelTest {
    @Test public void knownPhases() {
        assertEquals("Connecting…", CallPhaseLabel.of("connecting"));
        assertEquals("Listening", CallPhaseLabel.of("listening"));
        assertEquals("Thinking", CallPhaseLabel.of("thinking"));
        assertEquals("Echo is speaking", CallPhaseLabel.of("speaking"));
    }

    @Test public void idleAndUnknownAreBlank() {
        assertEquals("", CallPhaseLabel.of("idle"));
        assertEquals("", CallPhaseLabel.of("mystery"));
        assertEquals("", CallPhaseLabel.of(null));
    }
}
