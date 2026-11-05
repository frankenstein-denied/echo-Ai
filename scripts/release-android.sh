#!/usr/bin/env bash
# Publish a new Echo Android version. Installed apps see it on next launch and offer "Update now".
#
# 1. Bump versionCode (+1) and versionName in android/app/build.gradle.
# 2. Run: bash scripts/release-android.sh "What changed, in one line"
#
# Needs: GitHub CLI logged in (gh auth login), JDK 21 at ~/.jdks/jdk-21.0.13+9.
# The APK is signed with this PC's debug key; updates only install over an APK signed with the
# same key, so always release from this PC (switching to a release key needs one uninstall).
set -euo pipefail

notes="${1:-Bug fixes and improvements.}"
root="$(cd "$(dirname "$0")/.." && pwd)"
gradle_file="$root/android/app/build.gradle"

code="$(grep -E '^\s*versionCode ' "$gradle_file" | head -1 | grep -oE '[0-9]+')"
name="$(grep -E '^\s*versionName ' "$gradle_file" | head -1 | sed -E 's/.*"(.*)".*/\1/')"
tag="android-v$code"

if gh release view "$tag" >/dev/null 2>&1; then
  echo "Release $tag already exists. Bump versionCode in android/app/build.gradle first." >&2
  exit 1
fi

export JAVA_HOME="${JAVA_HOME:-$HOME/.jdks/jdk-21.0.13+9}"
(cd "$root/android" && ./gradlew.bat assembleDebug -q)

out="$(mktemp -d)"
cp "$root/android/app/build/outputs/apk/debug/app-debug.apk" "$out/echo.apk"
node -e 'process.stdout.write(JSON.stringify({versionCode:+process.argv[1],versionName:process.argv[2],notes:process.argv[3]}))' \
  "$code" "$name" "$notes" > "$out/version.json"

gh release create "$tag" "$out/echo.apk" "$out/version.json" \
  --title "Echo Android $name" --notes "$notes" --latest

echo "Published $tag ($name). Phones will offer the update next time Echo opens."
