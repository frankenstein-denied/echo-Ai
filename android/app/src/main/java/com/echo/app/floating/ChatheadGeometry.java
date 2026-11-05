package com.echo.app.floating;

/** Pure maths for the chathead. No Android imports, so it runs in plain unit tests. */
public final class ChatheadGeometry {
    /** Same values as WindowManager.LayoutParams, kept here so tests need no Android classes. */
    public static final int FLAG_NOT_FOCUSABLE = 0x00000008;
    public static final int FLAG_NOT_TOUCH_MODAL = 0x00000020;

    private ChatheadGeometry() {}

    /** Left edge x after release: the nearest side edge of the screen. */
    public static int snapX(int x, int headSize, int screenW) {
        return (x + headSize / 2 < screenW / 2) ? 0 : screenW - headSize;
    }

    public static boolean isTap(float dx, float dy, long ms, float slop) {
        return Math.abs(dx) <= slop && Math.abs(dy) <= slop && ms <= 300;
    }

    public static boolean overRemoveTarget(int cx, int cy, int targetCx, int targetCy, int radius) {
        long dx = cx - targetCx;
        long dy = cy - targetCy;
        return dx * dx + dy * dy <= (long) radius * radius;
    }

    public static int clampY(int y, int headSize, int screenH) {
        return Math.max(0, Math.min(y, screenH - headSize));
    }

    /** Flags for the open diary window: focusable (keyboard works); outside touches pass to the dim layer. */
    public static int panelFlags() {
        return FLAG_NOT_TOUCH_MODAL;
    }
}
