# BillLens — Android closed-testing checklist

Status date: 2026-10-22. Automated gates: 212 suites / 4,881 tests, TypeScript
clean, ESLint clean, Expo Doctor 21/21, web + Android JS exports pass. No
physical-device run has been performed.

## Build (requires local Android toolchain or free EAS allowance)

```bash
npx expo prebuild --platform android
cd android && ./gradlew assembleRelease   # or bundleRelease for an AAB
```

The ML Kit OCR module (`@react-native-ml-kit/text-recognition`, MIT) is a native
dependency. **Expo Go cannot run it**; use a development/release build. Verify
the Android build includes `com.google.mlkit:text-recognition`.

## Device tests (mark PASS/FAIL, device + Android version)

1. Fresh install, airplane mode, launch, create group + 4 members.
2. Manual ₹100 equal split → ₹25 each; restart; data persists.
3. Edit ₹1,200 → ₹1,500; one expense, balances update once.
4. Multi-payer: A ₹700 + B ₹500, 3-way equal (₹400 each).
5. Item editor: shared item, tax, discount; total must reconcile; reopen.
6. Camera permission allow/deny; capture, retake, cancel.
7. Gallery JPEG/PNG/HEIC; content:// URI survives OCR.
8. OCR: receipt photo → text → parser → editable draft → confirm → expense.
9. Search text/group/date; large list scrolling.
10. Recurring daily/weekly/monthly/yearly; pause/resume; catch-up; no duplicates.
11. Local reminder toggle, permission deny, delivery, cancellation when settled.
12. PDF/XLSX share sheet; open files; Unicode names.
13. Encrypted backup create/share; restore on clean install; wrong password.
14. UPI deep link opens app chooser; payment is NOT auto-confirmed.
15. Low storage / process kill during capture and restore.
16. Android back navigation and duplicate-header check.
17. Migration from v2.16 database to v2.17 (version 9 → 10).

## Google Play console actions (developer account required)

- Create app, package ID from `app.config.ts`, upload signed AAB.
- Complete Data Safety: local financial data, no sale, no mandatory account,
  optional cloud disabled; receipt images stay on device.
- Privacy policy URL (must be publicly reachable; free static hosting).
- Store listing: title, short/full description, icon 512×512, feature graphic,
  phone screenshots.
- Content rating questionnaire, target audience, ads declaration.
- Closed testing track with testers; verify the account's current closed-testing
  duration requirement in Play Console (varies by account type).
- Do not claim production approval before Google reviews the release.

## Known blockers

- No signed AAB or device E2E yet.
- Receipt image files are not in backups.
- Sync UI/relay not deployed; no real-time multi-device sync is claimed.
- Live FX conversion not implemented.
