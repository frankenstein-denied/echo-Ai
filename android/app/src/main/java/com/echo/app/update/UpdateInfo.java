package com.echo.app.update;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/** The published latest version (version.json on the newest GitHub release). Pure, JVM-tested. */
public final class UpdateInfo {
    private static final int MAX_CHANGES = 8;

    public final int versionCode;
    public final String versionName;
    public final String notes;
    /** What's new, one short line each. */
    public final List<String> changes;

    UpdateInfo(int versionCode, String versionName, String notes, List<String> changes) {
        this.versionCode = versionCode;
        this.versionName = versionName;
        this.notes = notes;
        this.changes = Collections.unmodifiableList(changes);
    }

    /** Parses {"versionCode": 3, "versionName": "1.2", "notes": "...", "changes": ["..."]}; null if missing or malformed. */
    public static UpdateInfo parse(String json) {
        if (json == null) return null;
        try {
            JSONObject o = new JSONObject(json);
            int code = o.optInt("versionCode", -1);
            if (code <= 0) return null;
            String notes = o.optString("notes", "");
            return new UpdateInfo(code, o.optString("versionName", String.valueOf(code)), notes,
                changesOf(o.optJSONArray("changes"), notes));
        } catch (JSONException e) {
            return null;
        }
    }

    /** The "changes" list, or the lines of "notes" for a release published without one. */
    private static List<String> changesOf(JSONArray arr, String notes) {
        List<String> out = new ArrayList<>();
        if (arr != null) {
            for (int i = 0; i < arr.length() && out.size() < MAX_CHANGES; i++) add(out, arr.optString(i, ""));
        }
        if (!out.isEmpty()) return out;
        for (String line : notes.split("\n")) {
            if (out.size() < MAX_CHANGES) add(out, line);
        }
        return out;
    }

    private static void add(List<String> out, String line) {
        String clean = line.trim();
        if (clean.startsWith("•") || clean.startsWith("-")) clean = clean.substring(1).trim();
        if (!clean.isEmpty()) out.add(clean);
    }

    public boolean isNewerThan(int installedVersionCode) {
        return versionCode > installedVersionCode;
    }
}
