> **BillLens v2.25.0 | Repository-grounded documentation audit | 2026-10-23** \n> Source snapshot: `BillLens(5).zip`. Statuses describe source inspection and previously documented tests; **no native device tests were executed during this audit**. \n> These consolidated files supersede conflicting planning claims; historical files remain available.

# Deployment, builds and release operations

## Environments and native requirements

The project targets Expo SDK 58 / React Native 0.88.1. Expo Go must also be on SDK 58; check dependency compatibility with `npx expo install --check` and run `npx expo-doctor` before launch. Expo Go is for limited JS iteration; it cannot include arbitrary native ML Kit modules, and Android Expo Go does not provide remote push support. Test local notification APIs and ML Kit on a compatible **SDK 58 development build**; build/verify native modules for the installed Expo SDK. `eas.json` contains build profiles; inspect and verify before signing. No paid hosting or credentials are necessary for local-only MVP.

## Build and release sequence

1. Lock dependency versions, confirm `npx expo install --check`, Expo Doctor compatibility and the supported Node.js version.
2. Run TypeScript, lint, unit, SQLite migration, secret scan and Expo Android export; record results.
3. Create development build; test startup, permissions, camera, gallery, OCR, manual expenses, settlement, notification schedule, backup and restore on Android.
4. Test older-install upgrade without wiping SQLite; separately test Android process death and storage pressure.
5. Execute iOS device matrix if targeting iOS; perform VoiceOver/TalkBack and performance measurements.
6. Build signed internal release, verify keystore/credentials management, permissions, privacy labels, legal URLs and Play Store forms.
7. Closed beta → staged rollout → monitor crashes and financial correctness → document rollback/incident process.

## Optional encrypted relay

Requires explicit approval, credentials, free-tier limits, secure signing/keys, abuse controls, uptime/TTL monitoring, backup/recovery strategy and real two-device tests. The reference relay is not deployed. A free tier can change or exhaust quotas; do not promise cost-free unlimited group sync.

## Release and rollback

Do not delete local financial data on rollback. Schema migrations must remain backward compatible or have tested export/recovery strategy. Never mark READY without the gates in `docs/release/launch-decision.md` and current test evidence. Historical reports remain snapshots, not current release guarantees.
