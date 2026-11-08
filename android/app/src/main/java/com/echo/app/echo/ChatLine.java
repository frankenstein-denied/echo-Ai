package com.echo.app.echo;

/** One message on a diary page, as a check-in needs it. */
public final class ChatLine {
    public final boolean fromUser;
    public final String text;
    public final boolean checkIn;

    public ChatLine(boolean fromUser, String text, boolean checkIn) {
        this.fromUser = fromUser;
        this.text = text;
        this.checkIn = checkIn;
    }
}
