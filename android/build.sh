#!/usr/bin/env bash
set -euo pipefail
if [[ "${GITHUB_ACTIONS:-}" == true ]]; then
  trap 'echo "::error file=android/build.sh,line=$LINENO::Failed command: $BASH_COMMAND"' ERR
fi
cd "$(dirname "$0")/.."
SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
if [[ -z "$SDK" ]]; then echo 'Set ANDROID_HOME to an SDK with platform 35 and build-tools 35.0.0.' >&2; exit 1; fi
BT="$SDK/build-tools/35.0.0"
JAR="$SDK/platforms/android-35/android.jar"
for tool in "$BT/aapt2" "$BT/d8" "$BT/zipalign" "$BT/apksigner" "$JAR"; do
  [[ -e "$tool" ]] || { echo "Missing Android SDK component: $tool" >&2; exit 1; }
done
[[ -f dist/index.html ]] || { echo 'Run npm run build first.' >&2; exit 1; }
WORK="$PWD/build/android"
OUT="$PWD/build/apk"
rm -rf "$WORK"; mkdir -p "$WORK/gen" "$WORK/classes" "$WORK/dex" "$WORK/assets" "$OUT"
cp dist/index.html dist/game.js dist/style.css "$WORK/assets/"
"$BT/aapt2" compile --dir android/res -o "$WORK/resources.zip"
"$BT/aapt2" link -o "$WORK/unsigned.apk" -I "$JAR" --manifest android/AndroidManifest.xml \
  --java "$WORK/gen" -A "$WORK/assets" --min-sdk-version 26 --target-sdk-version 35 \
  --version-code "${VERSION_CODE:-1}" --version-name "${VERSION_NAME:-1.0.0}" "$WORK/resources.zip"
mapfile -t generated < <(find "$WORK/gen" -name '*.java')
javac -encoding UTF-8 -source 8 -target 8 -bootclasspath "$JAR" -d "$WORK/classes" \
  "${generated[@]}" android/src/com/radekparek/basketrandom/MainActivity.java
mapfile -t classes < <(find "$WORK/classes" -name '*.class')
"$BT/d8" --lib "$JAR" --min-api 26 --output "$WORK/dex" "${classes[@]}"
jar --update --file "$WORK/unsigned.apk" --no-manifest -C "$WORK/dex" classes.dex
"$BT/zipalign" -f -p 4 "$WORK/unsigned.apk" "$WORK/aligned.apk"
if [[ -n "${ANDROID_KEYSTORE_BASE64:-}" ]]; then
  : "${ANDROID_KEYSTORE_PASSWORD:?Set ANDROID_KEYSTORE_PASSWORD}"
  : "${ANDROID_KEY_PASSWORD:?Set ANDROID_KEY_PASSWORD}"
  printf '%s' "$ANDROID_KEYSTORE_BASE64" | base64 --decode > "$WORK/release.jks"
  KEYSTORE="$WORK/release.jks" ALIAS="${ANDROID_KEY_ALIAS:?Set ANDROID_KEY_ALIAS}"
  STORE_PASS="$ANDROID_KEYSTORE_PASSWORD" KEY_PASS="$ANDROID_KEY_PASSWORD" NAME=BasketRandom-release.apk
else
  KEYSTORE="$WORK/debug.keystore" ALIAS=androiddebugkey STORE_PASS=android KEY_PASS=android NAME=BasketRandom-debug.apk
  keytool -genkeypair -keystore "$KEYSTORE" -storepass android -keypass android -alias androiddebugkey \
    -keyalg RSA -keysize 2048 -validity 10000 -dname 'CN=Android Debug,O=Android,C=US' >/dev/null
fi
"$BT/apksigner" sign --ks "$KEYSTORE" --ks-key-alias "$ALIAS" --ks-pass "pass:$STORE_PASS" --key-pass "pass:$KEY_PASS" \
  --out "$OUT/$NAME" "$WORK/aligned.apk"
"$BT/apksigner" verify --verbose "$OUT/$NAME"
jar tf "$OUT/$NAME" | grep -qx classes.dex
jar tf "$OUT/$NAME" | grep -qx assets/index.html
jar tf "$OUT/$NAME" | grep -qx assets/game.js
jar tf "$OUT/$NAME" | grep -qx assets/style.css
SIZE=$(stat -c%s "$OUT/$NAME")
(( SIZE < 262144 )) || { echo "APK exceeded 256 KiB: $SIZE bytes" >&2; exit 1; }
printf 'APK: %s (%s bytes)\n' "$OUT/$NAME" "$SIZE"
