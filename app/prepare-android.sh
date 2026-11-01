#!/usr/bin/env bash
# 在 npx cap add android 之后运行：换图标、加相机权限、设图标底色
set -e
cd "$(dirname "$0")"
RES=android/app/src/main/res
for d in icons/mipmap-*; do cp "$d"/*.png "$RES/$(basename "$d")/"; done
mkdir -p "$RES/values"
cat > "$RES/values/ic_launcher_background.xml" <<'X'
<?xml version="1.0" encoding="utf-8"?>
<resources><color name="ic_launcher_background">#1D4E89</color></resources>
X
M=android/app/src/main/AndroidManifest.xml
grep -q 'android.permission.CAMERA' "$M" || sed -i 's#<uses-permission android:name="android.permission.INTERNET" />#<uses-permission android:name="android.permission.INTERNET" />\n    <uses-permission android:name="android.permission.CAMERA" />#' "$M"
grep -n 'permission' "$M"
