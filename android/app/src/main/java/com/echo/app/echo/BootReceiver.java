package com.echo.app.echo;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import com.echo.app.floating.CheckInAlarm;
import com.echo.app.floating.CheckInEngine;

/** Restores the pinned notification, the check-in alarm and the bubble after a reboot or an app update, with no app open. */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent == null ? null : intent.getAction();
        if (!Intent.ACTION_BOOT_COMPLETED.equals(action) && !Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) return;
        Context ctx = context.getApplicationContext();
        Runnable finish = CheckInAlarm.finishInTime(goAsync()); // the profile may have to be read over the network
        new Thread(() -> {
            try {
                SessionStore store = SessionStore.get(ctx);
                if (store.isPinned() && store.hasSession()) PinnedController.refresh(ctx);
                CheckInEngine.onBoot(ctx);
            } catch (RuntimeException ignored) {
                // Secure storage unavailable (e.g. locked keystore) or start not allowed: never crash a boot receiver.
            } finally {
                finish.run();
            }
        }, "echo-boot").start();
    }
}
