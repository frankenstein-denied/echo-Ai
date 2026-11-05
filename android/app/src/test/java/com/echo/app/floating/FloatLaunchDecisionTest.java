package com.echo.app.floating;

import static com.echo.app.floating.FloatLaunchDecision.Outcome.*;
import static com.echo.app.floating.FloatLaunchDecision.decide;
import static org.junit.Assert.assertEquals;

import org.junit.Test;

public class FloatLaunchDecisionTest {
    @Test public void signedOutOpensApp() {
        assertEquals(OPEN_APP, decide("talk", false, true, true, false, false, false));
    }

    @Test public void missingOverlayOpensSettings() {
        assertEquals(OPEN_OVERLAY_SETTINGS, decide("type", true, false, true, false, false, false));
    }

    @Test public void talkNeedsMic() {
        assertEquals(REQUEST_MIC, decide("talk", true, true, false, false, false, false));
    }

    @Test public void typeNeedsNoMic() {
        assertEquals(SHOW_CHATHEAD, decide("type", true, true, false, false, false, false));
    }

    @Test public void talkStartsCall() {
        assertEquals(START_CALL, decide("talk", true, true, true, false, false, false));
    }

    @Test public void runningCallIsNotRestarted() {
        assertEquals(ALREADY_RUNNING, decide("talk", true, true, true, true, false, false));
    }

    @Test public void talkDuringTheSaveTailSaysTheLastCallIsFinishing() {
        assertEquals(FINISHING_LAST_CALL, decide("talk", true, true, true, true, false, true));
    }

    @Test public void typeIsNotAffectedByTheSaveTail() {
        assertEquals(SHOW_CHATHEAD, decide("type", true, true, true, true, false, true));
    }

    @Test public void appCallBlocks() {
        assertEquals(BLOCKED_BY_APP_CALL, decide("talk", true, true, true, false, true, false));
    }
}
