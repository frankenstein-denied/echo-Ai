package com.echo.app.floating;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class CallSessionStateTest {
    @Test public void connectTimeoutShowsFailureForThreeSeconds() {
        CallSessionState s = new CallSessionState();
        assertTrue(s.start(0));
        assertFalse(s.start(10)); // no second call
        s.tick(19999);
        assertFalse(s.shouldTearDown());
        assertFalse(s.hasFailed());
        s.tick(20000);
        assertEquals("Couldn't connect", s.pillText());
        assertTrue(s.hasFailed());
        s.tick(22999);
        assertFalse(s.shouldTearDown());
        s.tick(23000);
        assertTrue(s.shouldTearDown()); // failure shows 3 s
    }

    @Test public void exitWhileConnectingTearsDownAndLatePhaseCannotReviveIt() {
        CallSessionState e = new CallSessionState();
        e.start(0);
        e.requestExit(5);
        assertTrue(e.shouldTearDown());
        e.onPhase("speaking", 6);
        assertTrue(e.shouldTearDown());
        assertFalse(e.isRunning());
    }

    @Test public void quotaShowsItsMessageThenTearsDown() {
        CallSessionState q = new CallSessionState();
        q.start(0);
        q.onPhase("listening", 1);
        q.onEnded("quota", 2);
        assertEquals("Echo's voice reached today's limit", q.pillText());
        q.tick(3001);
        assertFalse(q.shouldTearDown());
        q.tick(5002);
        assertTrue(q.shouldTearDown());
    }

    @Test public void freshStateAfterAKillStartsCleanly() {
        CallSessionState r = new CallSessionState();
        assertFalse(r.isRunning());
        assertTrue(r.start(0));
        assertTrue(r.isRunning());
    }

    @Test public void droppedAndFailedShowTheirMessages() {
        CallSessionState d = new CallSessionState();
        d.start(0);
        d.onPhase("speaking", 1);
        d.onEnded("dropped", 2);
        assertEquals("The call dropped", d.pillText());
        assertFalse(d.shouldTearDown());

        CallSessionState f = new CallSessionState();
        f.start(0);
        f.onEnded("failed", 2);
        assertEquals("Couldn't connect", f.pillText());
        assertFalse(f.shouldTearDown());
    }

    @Test public void unknownOrMissingReasonIsAFailureNotASilentExit() {
        CallSessionState n = new CallSessionState();
        n.start(0);
        n.onEnded(null, 1);
        assertEquals("Couldn't connect", n.pillText());
        assertFalse(n.shouldTearDown());
    }

    @Test public void userEndTearsDownImmediately() {
        CallSessionState u = new CallSessionState();
        u.start(0);
        u.onPhase("listening", 1);
        u.onEnded("user", 2);
        assertTrue(u.shouldTearDown());
    }

    @Test public void pillFollowsThePhaseAndIdleKeepsTheLastText() {
        CallSessionState p = new CallSessionState();
        p.start(0);
        assertEquals("Connecting…", p.pillText());
        p.onPhase("idle", 1); // the page reports idle before it dials
        assertEquals("Connecting…", p.pillText());
        p.onPhase("listening", 2);
        assertEquals("Listening", p.pillText());
        p.onPhase("thinking", 3);
        assertEquals("Thinking", p.pillText());
        p.onPhase("mystery", 4);
        assertEquals("Thinking", p.pillText());
        p.onPhase("idle", 5); // arrives just before onEnded; must not blank the pill
        assertEquals("Thinking", p.pillText());
    }

    @Test public void connectingPhaseDoesNotStopTheConnectTimeout() {
        CallSessionState c = new CallSessionState();
        c.start(0);
        c.onPhase("idle", 100);
        c.onPhase("connecting", 200);
        c.tick(20000);
        assertTrue(c.hasFailed());
    }

    @Test public void connectedCallNeverTimesOut() {
        CallSessionState c = new CallSessionState();
        c.start(0);
        c.onPhase("listening", 19000);
        c.tick(3_600_000);
        assertFalse(c.hasFailed());
        assertFalse(c.shouldTearDown());
        assertEquals("Listening", c.pillText());
    }

    @Test public void failureIsFinal() {
        CallSessionState s = new CallSessionState();
        s.start(0);
        s.tick(20000);
        s.onPhase("listening", 20001); // connected too late: stays failed
        assertEquals("Couldn't connect", s.pillText());
        s.onEnded("user", 20002); // native ended the page after the timeout: message must still show
        assertFalse(s.shouldTearDown());
        assertEquals("Couldn't connect", s.pillText());
        s.onEnded("quota", 20003);
        assertEquals("Couldn't connect", s.pillText());
        s.tick(22999);
        assertFalse(s.shouldTearDown());
        s.tick(23000);
        assertTrue(s.shouldTearDown());
    }

    @Test public void stillRunningWhileTheFailureShowsSoNoSecondCallStarts() {
        CallSessionState s = new CallSessionState();
        s.start(0);
        s.onEnded("dropped", 1);
        assertTrue(s.isRunning());
        assertFalse(s.start(2));
    }

    @Test public void exitDuringFailureTearsDownAtOnce() {
        CallSessionState s = new CallSessionState();
        s.start(0);
        s.onEnded("dropped", 1);
        s.requestExit(2);
        assertTrue(s.shouldTearDown());
    }

    @Test public void finishedStateStaysFinished() {
        CallSessionState s = new CallSessionState();
        s.start(0);
        s.requestExit(1);
        s.onEnded("quota", 2);
        s.tick(100000);
        assertTrue(s.shouldTearDown());
        assertFalse(s.isRunning());
        assertFalse(s.start(100001));
    }

    @Test public void hasConnectedOnlyAfterALivePhaseAndStaysTrue() {
        CallSessionState s = new CallSessionState();
        s.start(0);
        s.onPhase("connecting", 1);
        assertFalse(s.hasConnected());
        s.onPhase("listening", 2);
        assertTrue(s.hasConnected());
        s.requestExit(3);
        assertTrue(s.hasConnected());
    }

    @Test public void connectTimeoutDiscardsThePageAndKeepsThePill() {
        CallSessionState s = new CallSessionState();
        s.start(0);
        assertFalse(s.shouldDiscardPage());
        s.tick(20000);
        assertTrue(s.shouldDiscardPage());
        assertEquals("Couldn't connect", s.pillText());
        assertFalse(s.shouldTearDown());
    }

    @Test public void failureBeforeConnectingDiscardsThePage() {
        CallSessionState s = new CallSessionState();
        s.start(0);
        s.onEnded("quota", 1);
        assertTrue(s.shouldDiscardPage());
    }

    @Test public void failureAfterConnectingKeepsThePageSoItCanSave() {
        CallSessionState s = new CallSessionState();
        s.start(0);
        s.onPhase("speaking", 1);
        assertFalse(s.shouldDiscardPage());
        s.onEnded("dropped", 2);
        assertFalse(s.shouldDiscardPage());
    }

    @Test public void voiceOffIsAFailureBeforeConnecting() {
        CallSessionState s = new CallSessionState();
        s.start(0);
        s.onEnded("voice_off", 100);
        assertEquals("Voice is off in Settings", s.pillText());
        assertTrue(s.hasFailed());
        assertTrue(s.shouldDiscardPage());
        assertFalse(s.hasConnected());
        s.tick(3099);
        assertFalse(s.shouldTearDown());
        assertEquals("Voice is off in Settings", s.pillText());
        s.tick(3100);
        assertTrue(s.shouldTearDown());
    }

    @Test public void eventsBeforeStartDoNothing() {
        CallSessionState s = new CallSessionState();
        s.onPhase("listening", 1);
        s.onEnded("failed", 2);
        s.requestExit(3);
        s.tick(100000);
        assertFalse(s.shouldTearDown());
        assertFalse(s.isRunning());
        assertTrue(s.start(100001));
    }
}
