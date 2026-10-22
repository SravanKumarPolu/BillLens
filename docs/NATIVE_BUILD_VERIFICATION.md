# Android native build verification

Date: 2026-10-22. Build performed from a throwaway copy of the repository with
a real (non-symlinked) `node_modules`, using Temurin JDK 17.0.20.1 and Android
SDK platforms 34/36.

## Commands

```bash
export JAVA_HOME=/tmp/jdk17/Contents/Home
export ANDROID_HOME=/Users/apple/Library/Android/sdk
npx expo prebuild -p android --no-install
cd android
./gradlew assembleDebug --no-daemon
./gradlew bundleDebug --no-daemon
```

## Results

- `expo prebuild -p android`: **success**
- `assembleDebug`: **BUILD SUCCESSFUL in 4m 31s**
- `bundleDebug`: **BUILD SUCCESSFUL in 33s**
- Debug APK: **241 MB** (all ABIs + all five ML Kit OCR models)
- Debug AAB: **94 MB**
- APK contains `libmlkit_google_ocr_pipeline.so` for `arm64-v8a`,
  `armeabi-v7a`, `x86`, `x86_64`, plus `assets/mlkit-google-ocr-models/`.
- The prebuild compatibility plugin rewrote the module's legacy
  `com.facebook.react:react-native:+` to `react-android`; Gradle resolved it.

## Not verified

- No Android device or emulator is attached (`adb devices` empty, no AVD).
- Runtime ML Kit recognition, camera/gallery, permissions, receipt persistence
  after restart, backup restore and TalkBack are still device tests.
- This is a **debug** build, not a signed release AAB. Store signing is not
  configured.
- The Hermes `Intl.RelativeTimeFormat` crash fix (activity tab and drafts
  inbox) is covered by unit tests and by an Android Hermes bytecode export,
  but has **not** been re-run on a physical device yet. `npx expo export -p
  android` produced `entry-*.hbc` successfully; opening the Activity tab on a
  device with several expenses and settlements is still pending.
