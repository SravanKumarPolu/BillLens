# BillLens — notification architecture

> Status: **implemented (v2.26.0+), hardened 2026-10-23/24.** Local reminders
> work in development/release builds; Expo Go and web are guarded; remote push
> is wired but opt-in and never started automatically.

## 1. What ships

One local, on-device reminder: the **outstanding-balance nudge**
(`billlens.outstanding-balances`, daily repeat, opt-in from Settings →
Reminders). No push service, no server, no cloud dependency.

## 2. Why the Expo Go guard exists

`expo-notifications`' package entry point eagerly re-exports
`topicSubscription`, which calls `requireNativeModule('ExpoTopicSubscriptionModule')`
**at import time**. That native module is not part of the Expo Go binary
(remote push was removed from Expo Go with SDK 53), so *importing the package
at all* throws `Cannot find native module 'ExpoTopicSubscriptionModule'` —
before any API call, so a `try/catch` around the call cannot help. The only
correct fix is to never evaluate the package in Expo Go, and to feature-detect
every API elsewhere.

Three symptoms this produced before the fix:

1. `Cannot find native module 'ExpoTopicSubscriptionModule'` (the import throw).
2. `undefined is not a function` in `refreshOutstandingReminder` — the failed
   import left a partially-initialised module namespace, so the first call
   (`setNotificationHandler`) was `undefined`. The logged line was only the
   `console.warn` site, never the cause.
3. `[expo-notifications] Push notifications (remote notifications) are
   unavailable in Expo Go on Android since SDK 53` — a module-scope warning
   from `DevicePushTokenAutoRegistration.fx`, printed by the same import
   chain. App code never registered for push.

## 3. Layers

| Layer | File | Role |
|---|---|---|
| Application (ports) | `src/application/notifications/notification-capability.port.ts` | `LocalNotificationPort`, `OutstandingReminderStore`, `RemotePushPort` — no Expo imports, every method total (never throws) |
| Application (use case) | `src/application/notifications/refresh-outstanding-reminder.usecase.ts` | The decision: enabled/settled/permission/dedupe/cancel; persists the outcome |
| Infrastructure | `src/infrastructure/notifications/notification-runtime.ts` | Runtime detection: `web` / `expo-go` / `native-build` (`Constants.expoGoConfig`/`appOwnership`, not `executionEnvironment`, which cannot separate Expo Go from a dev build) |
| Infrastructure | `src/infrastructure/notifications/expo-local-notification-port.ts` | The ONLY place `expo-notifications` is imported — lazily, feature-detected, Expo Go/web short-circuit before any import; creates the Android channel `billlens-reminders` |
| Infrastructure | `src/infrastructure/notifications/unavailable-local-notification-port.ts` | Hermetic default for the composition root (tests never load Expo) |
| Infrastructure | `src/infrastructure/notifications/remote-push-registration.ts` | Opt-in push registration; refuses Expo Go, web, missing EAS project id, and `enabled: false` |
| Infrastructure | `src/infrastructure/sqlite/sqlite-outstanding-reminder-store.ts` | Persists the last decision (migration 0013, `outstanding_reminder_state`, one row keyed by reminder id) |
| Composition | `src/infrastructure/composition-root.ts` (`NotificationServices`) | Wires the use case over injected ports; production bootstrap injects the Expo adapters (`src/store/services-registry.ts`) |
| Presentation | `src/presentation/notifications/outstanding-reminders.ts`, `use-outstanding-reminders.ts` | Counts groups with balances, serialises concurrent refreshes, reconciles on foreground/resume, refreshes after settlement confirm/dispute |

## 4. Behaviour matrix

| Runtime | Local reminder | Remote push |
|---|---|---|
| Development / release build | Evaluated, permission-gated, scheduled, deduplicated | Registered only on explicit opt-in with a configured EAS project id |
| Expo Go | Evaluated and **stored in SQLite** (`unsupported` / `stored_only`); the package is never imported | Blocked (`expo-go`), no import |
| Web | Evaluated and stored (`unsupported` / `stored_only`) | Blocked (`unsupported-platform`) |

The reminder decision is durable: if the runtime cannot present
notifications, the balance state is still recorded and the status surfaces
honestly (`unsupported`), so the Settings toggle never lies and nothing
blocks startup, group creation, expenses, settlements or balances.

## 5. Rules kept by the use case

- One stable OS identifier — rescheduling replaces, never duplicates.
- An identical pending notification is left alone (idempotent across
  resumes); a stale one (balance count changed) is cancelled and replaced.
- Cancelled as soon as the book settles, the preference is switched off, or
  permission is denied/withdrawn.
- Permission denial is graceful: status `denied`, toggle reset by Settings,
  alert points the user to system settings.
- Persistence failures never change the evaluated status and never throw.
- Android channel `billlens-reminders` is created before scheduling
  (`app.config.ts` sets it as the FCM `defaultChannel` fallback).

## 6. Tests

- `src/application/notifications/__tests__/refresh-outstanding-reminder.test.ts`
  — every status path, dedupe, stale replacement, storage failure, native failure.
- The full suite (224 suites / 4,960 tests) guards the wiring; the Expo Go
  guard is enforced by construction (the adapter refuses to import), which
  the runtime tests assert.

## 7. Device verification still owed

Delivery-while-backgrounded, delivery-after-restart and duplicate-delivery
checks on a physical device remain open (see `KNOWN_LIMITATIONS.md` KL-2 and
`FINAL_RELEASE_CHECKLIST.md`). The 2026-10-24 emulator run covered install,
cold boot offline, startup and no-fatal-log verification.
