package com.echo.app.update;

import org.json.JSONException;
import org.json.JSONObject;

/** The published latest version (version.json on the newest GitHub release). Pure, JVM-tested. */
public final class UpdateInfo {
    public final int versionCode;
    public final String versionName;
    public final String notes;

    UpdateInfo(int versionCode, String versionName, String notes) {
        this.versionCode = versionCode;
        this.versionName = versionName;
        this.notes = notes;
    }

    /** Parses {"versionCode": 3, "versionName": "1.2", "notes": "..."}; null if missing or malformed. */
    public static UpdateInfo parse(String json) {
        if (json == null) return null;
        try {
            JSONObject o = new JSONObject(json);
            int code = o.optInt("versionCode", -1);
            if (code <= 0) return null;
            return new UpdateInfo(code, o.optString("versionName", String.valueOf(code)), o.optString("notes", ""));
        } catch (JSONException e) {
            return null;
        }
    }

    public boolean isNewerThan(int installedVersionCode) {
        return versionCode > installedVersionCode;
    }
}
