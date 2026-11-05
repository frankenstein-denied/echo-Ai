package com.echo.app.echo;

import android.content.Context;

/** Entry point for the pinned notification. Service wiring is added in Task 3. */
public final class PinnedController {
    private PinnedController() {}

    public static void setPinned(Context ctx, boolean pinned) {
        SessionStore.get(ctx).setPinned(pinned);
        // TODO(Task 3): start the foreground service when pinned (or show a "sign in" notification
        // if there is no session), stop it when not pinned.
    }

    public static void refresh(Context ctx) {
        // TODO(Task 3): ask the running service to reload its data.
    }

    public static void stop(Context ctx) {
        // TODO(Task 3): stop the notification service.
    }
}
