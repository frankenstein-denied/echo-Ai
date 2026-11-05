package com.echo.app.echo;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Restores the pinned notification after a reboot or an app update. */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent == null ? null : intent.getAction();
        if (!Intent.ACTION_BOOT_COMPLETED.equals(action) && !Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) return;
        Context ctx = context.getApplicationContext();
        try {
            SessionStore store = SessionStore.get(ctx);
            if (!store.isPinned()) return;
            RefreshWorker.schedule(ctx);
            if (store.hasSession()) PinnedController.refresh(ctx);
        } catch (RuntimeException ignored) {
            // Secure storage unavailable (e.g. locked keystore) or start not allowed: never crash a boot receiver.
        }
    }
}
