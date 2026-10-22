# Camera, gallery and on-device OCR — device checklist

Date: 2026-10-22. Automated gates: 216 suites / 4,913 tests, TypeScript clean,
ESLint clean, Expo Doctor 21/21, web + Android JS exports pass. **No Android
native compile or physical-device run has been performed.**

## Native dependency audit

- `@react-native-ml-kit/text-recognition` **2.0.0**, MIT.
- Android Java module autolinked as `com.rnmlkit.textrecognition.TextRecognitionPackage`.
- ML Kit dependencies: text-recognition 16.0.1 plus Latin, Chinese, Devanagari,
  Japanese and Korean models. Models are bundled; recognition is offline and
  needs no account or API key. APK size will increase noticeably.
- No Expo config plugin ships with the package. `plugins/with-mlkit-android-compat.js`
  rewrites its legacy `com.facebook.react:react-native:+` dependency to
  `react-android` for RN 0.86.
- Expo Doctor excludes only this package from React Native Directory checks.
  That exclusion is documentation, not proof of native compatibility.
- `expo prebuild -p android` succeeded in a throwaway copy and autolinking found
  the module. **Gradle compile was not run: no Java runtime is installed.**

## Build commands

```bash
npx expo prebuild --platform android
cd android && ./gradlew assembleDebug
# then verify the APK contains com.google.mlkit:text-recognition
```

## Device tests

1. Camera permission allow, deny, deny-forever, retry from settings.
2. Capture, preview, Retake, Replace, Cancel; rotate the device during capture.
3. Background/foreground the app during capture and during OCR.
4. Gallery JPEG, PNG, HEIC; Android content:// URI; repeated replacement.
5. Pick a very large photo; confirm no OOM and OCR still runs.
6. Offline OCR with airplane mode: receipt → text → review → save.
7. OCR failure path: clear message + manual entry still works.
8. Rotated/low-light receipt; confirm warnings and editable confidence.
9. Manual edits survive review/navigation and are not overwritten by OCR.
10. Confirm save, reopen expense, restart app: receipt reference still readable.
11. Cancel OCR/draft: no financial record saved.
12. Verify production build never selects mock OCR.
13. Delete a group with a receipt: cleanup queue drains after restart.
14. Low-storage capture and restore.

Record device model, Android version, build type and exact failure logs.
