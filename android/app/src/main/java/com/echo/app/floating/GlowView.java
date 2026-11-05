package com.echo.app.floating;

import android.animation.ObjectAnimator;
import android.animation.ValueAnimator;
import android.content.Context;
import android.graphics.Canvas;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Shader;
import android.view.View;

/** Neon edge glow for a floating call. Pulses through view alpha, so it never redraws per frame. */
final class GlowView extends View {
    private static final int GLOW = 0xFF39FF88;
    private static final int CLEAR = 0x0039FF88;
    private static final float THICKNESS_DP = 28f;
    private static final float DIM_ALPHA = 0.55f;
    private static final long PULSE_MS = 1400;

    private final float thickness;
    private final Paint top = new Paint();
    private final Paint bottom = new Paint();
    private final Paint left = new Paint();
    private final Paint right = new Paint();
    private final ObjectAnimator pulse;

    GlowView(Context ctx) {
        super(ctx);
        thickness = THICKNESS_DP * ctx.getResources().getDisplayMetrics().density;
        pulse = ObjectAnimator.ofFloat(this, View.ALPHA, DIM_ALPHA, 1f);
        pulse.setDuration(PULSE_MS);
        pulse.setRepeatCount(ValueAnimator.INFINITE);
        pulse.setRepeatMode(ValueAnimator.REVERSE);
    }

    @Override protected void onSizeChanged(int w, int h, int oldW, int oldH) {
        top.setShader(fade(0, 0, 0, thickness));
        bottom.setShader(fade(0, h, 0, h - thickness));
        left.setShader(fade(0, 0, thickness, 0));
        right.setShader(fade(w, 0, w - thickness, 0));
    }

    @Override protected void onDraw(Canvas c) {
        float w = getWidth();
        float h = getHeight();
        c.drawRect(0, 0, w, thickness, top);
        c.drawRect(0, h - thickness, w, h, bottom);
        c.drawRect(0, 0, thickness, h, left);
        c.drawRect(w - thickness, 0, w, h, right);
    }

    /** Also runs on attach and detach, and stops the pulse while the screen is off. */
    @Override protected void onWindowVisibilityChanged(int visibility) {
        super.onWindowVisibilityChanged(visibility);
        if (visibility != VISIBLE) pulse.cancel();
        else if (!pulse.isStarted()) pulse.start();
    }

    private static LinearGradient fade(float x0, float y0, float x1, float y1) {
        return new LinearGradient(x0, y0, x1, y1, GLOW, CLEAR, Shader.TileMode.CLAMP);
    }
}
