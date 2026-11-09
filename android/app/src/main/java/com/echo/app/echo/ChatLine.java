package com.echo.app.echo;

/** One message on a diary page, as a check-in needs it. */
public final class ChatLine {
    public final boolean fromUser;
    public final String text;
    public final boolean checkIn;
    /** When it was sent, or 0 when unknown. */
    public final long atMs;

    public ChatLine(boolean fromUser, String text, boolean checkIn) {
        this(fromUser, text, checkIn, 0L);
    }

    public ChatLine(boolean fromUser, String text, boolean checkIn, long atMs) {
        this.fromUser = fromUser;
        this.text = text;
        this.checkIn = checkIn;
        this.atMs = atMs;
    }
}
