package com.echo.app.echo;

import java.io.UnsupportedEncodingException;
import java.net.URLEncoder;

/** In-app deep-link paths and safe URL building. No Android dependencies. */
public final class DeepLinks {
    public static final String LIVE_SITE = "https://echo-ai-blue.vercel.app";
    public static final String EXTRA_PATH = "echo_path";
    public static final String DIARY = "/?view=Diary";
    public static final String REMINDERS = "/?view=Reminders";
    private static final String VIEW_PREFIX = "/?view=";

    private DeepLinks() {}

    public static String goalPath(String goalId) {
        try {
            return "/?view=Goals&goal=" + URLEncoder.encode(goalId == null ? "" : goalId, "UTF-8");
        } catch (UnsupportedEncodingException e) {
            throw new AssertionError(e);
        }
    }

    /** Like {@link #resolve} but only accepts in-app view links (paths starting with {@code /?view=}). */
    public static String resolveViewPath(String base, String path) {
        if (path == null || !path.startsWith(VIEW_PREFIX)) return null;
        return resolve(base, path);
    }

    /**
     * {@code base + path} when {@code path} is a same-origin absolute path, else null. Rejects
     * schemes, protocol-relative paths, backslashes, '@', whitespace and control characters.
     */
    public static String resolve(String base, String path) {
        if (path == null || path.length() < 1 || path.charAt(0) != '/' || path.startsWith("//")) return null;
        for (int i = 0; i < path.length(); i++) {
            char c = path.charAt(i);
            if (c <= 0x20 || c == 0x7f || c == '\\' || c == '@') return null;
        }
        String b = base == null || base.trim().isEmpty() ? LIVE_SITE : base.trim();
        while (b.endsWith("/")) b = b.substring(0, b.length() - 1);
        return b + path;
    }
}
