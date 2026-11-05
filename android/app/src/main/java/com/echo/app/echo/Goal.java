package com.echo.app.echo;

public final class Goal {
    public final String id;
    public final String title;
    public final double progress;
    public final long updatedAtMs;

    public Goal(String id, String title, double progress, long updatedAtMs) {
        this.id = id;
        this.title = title;
        this.progress = progress;
        this.updatedAtMs = updatedAtMs;
    }
}
