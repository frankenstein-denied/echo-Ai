package com.echo.app.floating;

import android.app.NotificationManager;
import android.content.ContentResolver;
import android.content.Context;
import android.content.res.AssetFileDescriptor;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.util.Log;
import com.echo.app.R;
import java.io.IOException;

/** Echo's double buzz beside the small message. Respects silent mode and Do Not Disturb, and never gets in the way of the message. */
final class EchoBuzz {
    private static final String TAG = "CheckInTiming";
    /** Off, on, off, on: matches the two pulses in echo_buzz.wav. */
    static final long[] VIBRATION = {0L, 120L, 60L, 120L};

    private static MediaPlayer player; // held so it can't be collected mid-sound; main thread only

    private EchoBuzz() {}

    /** By name, not id: a channel keeps this for good, and ids change between builds. */
    static Uri soundUri(Context ctx) {
        return Uri.parse(ContentResolver.SCHEME_ANDROID_RESOURCE + "://" + ctx.getPackageName() + "/raw/echo_buzz");
    }

    static AudioAttributes audioAttributes() {
        return new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build();
    }

    /** Main thread. */
    static void play(Context ctx) {
        try {
            NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null && nm.getCurrentInterruptionFilter() > NotificationManager.INTERRUPTION_FILTER_ALL) return;
            AudioManager audio = (AudioManager) ctx.getSystemService(Context.AUDIO_SERVICE);
            int mode = audio == null ? AudioManager.RINGER_MODE_NORMAL : audio.getRingerMode();
            if (mode == AudioManager.RINGER_MODE_SILENT) return;
            if (mode == AudioManager.RINGER_MODE_NORMAL) sound(ctx);
            vibrate(ctx);
        } catch (RuntimeException e) {
            Log.w(TAG, "buzz failed", e);
        }
    }

    private static void sound(Context ctx) {
        release();
        MediaPlayer p = new MediaPlayer();
        player = p;
        try (AssetFileDescriptor fd = ctx.getResources().openRawResourceFd(R.raw.echo_buzz)) {
            p.setAudioAttributes(audioAttributes());
            p.setDataSource(fd.getFileDescriptor(), fd.getStartOffset(), fd.getLength());
            p.setOnPreparedListener(MediaPlayer::start);
            p.setOnCompletionListener(done -> release());
            p.setOnErrorListener((failed, what, extra) -> {
                release();
                return true;
            });
            p.prepareAsync(); // never blocks the main thread
        } catch (IOException | RuntimeException e) {
            Log.w(TAG, "buzz sound failed", e);
            release();
        }
    }

    private static void release() {
        MediaPlayer p = player;
        player = null;
        if (p == null) return;
        try {
            p.release();
        } catch (RuntimeException e) {
            Log.w(TAG, "could not release the buzz", e);
        }
    }

    @SuppressWarnings("deprecation") // the pattern overload: VibrationEffect needs Android 8
    private static void vibrate(Context ctx) {
        Vibrator vibrator = (Vibrator) ctx.getSystemService(Context.VIBRATOR_SERVICE);
        if (vibrator == null || !vibrator.hasVibrator()) return;
        if (Build.VERSION.SDK_INT >= 26) {
            vibrator.vibrate(VibrationEffect.createWaveform(VIBRATION, -1), audioAttributes());
        } else {
            vibrator.vibrate(VIBRATION, -1);
        }
    }
}
