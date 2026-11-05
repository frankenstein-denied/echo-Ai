package com.echo.app.echo;

public final class Reminder {
    public final String id;
    public final String title;
    public final long dueAtMs;
    public final boolean done;

    public Reminder(String id, String title, long dueAtMs, boolean done) {
        this.id = id;
        this.title = title;
        this.dueAtMs = dueAtMs;
        this.done = done;
    }
}
