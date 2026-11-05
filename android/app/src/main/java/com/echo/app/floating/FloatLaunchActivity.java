package com.echo.app.floating;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.provider.Settings;
import android.util.Log;
import android.widget.Toast;
import com.echo.app.MainActivity;
import com.echo.app.R;
import com.echo.app.echo.SessionStore;

/** Transparent trampoline behind the notification Talk and Type buttons. Decides, acts, finishes. */
public class FloatLaunchActivity extends Activity {
    public static final String ACTION_TALK = "talk";
    public static final String ACTION_TYPE = "type";
    public static final String EXTRA_ACTION = "echo_float_action";

    private static final String TAG = "FloatLaunch";
    private static final int REQ_MIC = 7;

    private String action;
    private boolean startCallOnResume;

    @Override protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        action = getIntent().getStringExtra(EXTRA_ACTION);
        if (!ACTION_TALK.equals(action)) action = ACTION_TYPE;
        if (savedInstanceState == null) run();
    }

    private void run() {
        boolean signedIn = false;
        try {
            signedIn = SessionStore.get(this).hasSession();
        } catch (IllegalStateException ignored) {
            // secure storage unavailable: treat as signed out
        }
        boolean overlay = Settings.canDrawOverlays(this);
        boolean mic = checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED;
        FloatLaunchDecision.Outcome outcome = FloatLaunchDecision.decide(
            action, signedIn, overlay, mic, FloatState.callRunning, FloatState.appCallActive,
            FloatState.callFinishing);

        switch (outcome) {
            case OPEN_APP:
                startActivity(new Intent(this, MainActivity.class)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP));
                break;
            case OPEN_OVERLAY_SETTINGS:
                Toast.makeText(this, R.string.float_allow_overlay, Toast.LENGTH_LONG).show();
                startActivity(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    Uri.parse("package:" + getPackageName())).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
                break;
            case REQUEST_MIC:
                requestPermissions(new String[] {Manifest.permission.RECORD_AUDIO}, REQ_MIC);
                return; // finish after the result
            case START_CALL:
                // Android 14+ only grants the mic to a service started while Echo is really in front.
                // Both paths here (onCreate, permission result) are followed by onResume.
                startCallOnResume = true;
                return;
            case SHOW_CHATHEAD:
                ChatheadService.show(this); // before finish(), while Echo is still in the foreground
                break;
            case ALREADY_RUNNING:
                Log.i(TAG, "ALREADY_RUNNING");
                break;
            case FINISHING_LAST_CALL:
                Toast.makeText(this, R.string.float_call_finishing, Toast.LENGTH_LONG).show();
                break;
            case BLOCKED_BY_APP_CALL:
                Toast.makeText(this, R.string.float_blocked_by_app_call, Toast.LENGTH_LONG).show();
                break;
        }
        finish();
        overridePendingTransition(0, 0);
    }

    @Override protected void onResume() {
        super.onResume();
        if (!startCallOnResume) return;
        startCallOnResume = false;
        FloatingCallService.start(this);
        finish();
        overridePendingTransition(0, 0);
    }

    /** Never resumed (e.g. the screen locked first): drop the start rather than linger or dial later. */
    @Override protected void onStop() {
        super.onStop();
        if (!startCallOnResume) return;
        startCallOnResume = false;
        finish();
    }

    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQ_MIC && grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
            run();
        } else {
            if (requestCode == REQ_MIC) Toast.makeText(this, R.string.float_mic_needed, Toast.LENGTH_LONG).show();
            finish();
            overridePendingTransition(0, 0);
        }
    }
}
