package com.echo.app.floating;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;
import com.echo.app.echo.EchoApi;
import com.echo.app.echo.FirestoreJson;
import com.echo.app.echo.PinnedController;
import com.echo.app.echo.SessionStore;
import java.util.TimeZone;

/**
 * A one-tap check-in answer, from the notification's buttons or the bubble's chips. Later only clears the
 * check-in; a save is written by the phone with the native session, off the main thread, and the notification
 * then says "Saved" or "Couldn't save, open Echo" with a Try again that can't write twice.
 * Answers in words (Yes I ate, Tell Echo) never come here: they open the chat.
 */
public class CheckInAnswerReceiver extends BroadcastReceiver {
    static final String ACTION_ANSWER = "com.echo.app.action.CHECK_IN_ANSWER";
    static final String EXTRA_ID = "checkInId";
    static final String EXTRA_TOPIC = "topic";
    static final String EXTRA_CODE = "code";
    static final String EXTRA_REMINDER_ID = "reminderId";
    static final String EXTRA_REMINDER_DUE = "reminderDueAtMs";
    static final String EXTRA_ASKED_AT = "askedAtMs";
    static final String EXTRA_FROM_NOTIFICATION = "fromNotification";
    /** The page an earlier try used, so a retry after midnight still finds its answer there. */
    static final String EXTRA_PAGE_ID = "pageId";

    private static final String TAG = "CheckInAnswer";
    /** How long a save may wait for a check-in write in progress. Within the receiver's time limit. */
    private static final long LOCK_WAIT_MS = 15_000L;

    /** An explicit broadcast to this receiver carrying one answer to one check-in. */
    static Intent intent(Context ctx, String checkInId, CheckInPlanner.Topic topic, String code, String reminderId,
                         long reminderDueAtMs, long askedAtMs, boolean fromNotification) {
        return new Intent(ctx, CheckInAnswerReceiver.class)
            .setAction(ACTION_ANSWER)
            .putExtra(EXTRA_ID, checkInId)
            .putExtra(EXTRA_TOPIC, topic == null ? null : topic.name())
            .putExtra(EXTRA_CODE, code)
            .putExtra(EXTRA_REMINDER_ID, reminderId)
            .putExtra(EXTRA_REMINDER_DUE, reminderDueAtMs)
            .putExtra(EXTRA_ASKED_AT, askedAtMs)
            .putExtra(EXTRA_FROM_NOTIFICATION, fromNotification);
    }

    @Override public void onReceive(Context context, Intent intent) {
        if (intent == null || !ACTION_ANSWER.equals(intent.getAction())) return;
        Context app = context.getApplicationContext();
        String checkInId = intent.getStringExtra(EXTRA_ID);
        CheckInPlanner.Topic topic = CheckInEngine.parseTopic(intent.getStringExtra(EXTRA_TOPIC));
        String code = intent.getStringExtra(EXTRA_CODE);
        CheckInAnswer.Option option = CheckInAnswer.find(topic, code);
        if (checkInId == null || option == null || option.kind == CheckInAnswer.Kind.OPEN_CHAT) return;

        CheckInEngine.onAnswered(app, checkInId); // a tap is an answer, even if the save fails below
        if (option.kind == CheckInAnswer.Kind.LATER) return;

        long now = System.currentTimeMillis();
        TimeZone tz = TimeZone.getDefault();
        long askedAt = intent.getLongExtra(EXTRA_ASKED_AT, now);
        CheckInAnswer.Save save = CheckInAnswer.save(topic, code, now, intent.getLongExtra(EXTRA_REMINDER_DUE, 0L),
            CheckInAnswer.mealAt(CheckInPlanner.minuteOfDay(askedAt, tz)));
        if (save == null) return;
        boolean fromNotification = intent.getBooleanExtra(EXTRA_FROM_NOTIFICATION, false);
        String reminderId = intent.getStringExtra(EXTRA_REMINDER_ID);
        String pageIdHint = intent.getStringExtra(EXTRA_PAGE_ID);

        Runnable finish = CheckInAlarm.finishInTime(goAsync());
        new Thread(() -> {
            EchoApi.AnswerResult result = null;
            try {
                result = write(app, checkInId, save, reminderId, pageIdHint, tz);
            } catch (RuntimeException e) {
                Log.w(TAG, "answer failed", e);
            } finally {
                try {
                    if (result != null && result.saved) {
                        if (fromNotification) CheckInNotifier.showSaved(app, save.savedLine);
                        CheckInEngine.showOnBubble("✓ " + save.savedLine);
                    } else {
                        Intent retry = new Intent(intent).putExtra(EXTRA_FROM_NOTIFICATION, true)
                            .putExtra(EXTRA_PAGE_ID, result == null ? pageIdHint : result.pageId);
                        CheckInNotifier.showFailed(app, retry);
                        CheckInEngine.showOnBubble(app.getString(com.echo.app.R.string.check_in_save_failed));
                    }
                } finally {
                    finish.run();
                }
            }
        }, "echo-checkin-answer").start();
    }

    /**
     * Blocking. Holds the check-in write lock, so the answer and a check-in being written can't each create
     * today's page. A question still waiting to be written goes in the same commit, before the answer.
     */
    static EchoApi.AnswerResult write(Context app, String checkInId, CheckInAnswer.Save save, String reminderId,
                                      String pageIdHint, TimeZone tz) {
        SessionStore store = SessionStore.get(app);
        if (!store.hasSession()) return null;
        EchoApi api = new EchoApi(app);
        EchoApi.AnswerResult[] out = {null};
        CheckInEngine.whileWriting(LOCK_WAIT_MS, () -> {
            String question = checkInId.equals(store.getPendingCheckInId()) ? store.getPendingCheckInText() : null;
            EchoApi.AnswerResult r = api.writeCheckInAnswer(checkInId, question, save, reminderId, pageIdHint, tz);
            out[0] = r;
            if (!r.saved) return false;
            if (question != null && checkInId.equals(store.getPendingCheckInId())) {
                store.setPendingCheckInId(null); // the question went in with the answer
                store.setPendingCheckInText(null);
            }
            if (save.skippedMeal != null) {
                store.setSkippedMeal(FirestoreJson.dateKey(System.currentTimeMillis(), tz) + "|" + save.skippedMeal);
            }
            if (save.writesReminder()) {
                try {
                    PinnedController.refresh(app); // the pinned panel lists reminders
                } catch (RuntimeException e) {
                    Log.w(TAG, "could not refresh the pinned panel", e);
                }
            }
            return true;
        });
        return out[0];
    }
}
