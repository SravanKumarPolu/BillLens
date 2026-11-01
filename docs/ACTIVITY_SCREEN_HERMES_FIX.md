# Activity screen crash on Android Hermes — fix and Intl audit

Date: 2026-10-23
Scope: `ActivityScreen` crash (`TypeError: undefined cannot be used as a
constructor`), plus a repository-wide audit of optional ECMA-402 APIs.

## 1. Verdict on the pre-existing patch

The working tree already contained a partial fix. It was **not correct**:

- One of its own regression tests failed. The module-level formatter cache was
  not tied to the constructor, so after a test replaced
  `Intl.RelativeTimeFormat` with a throwing function the stale, working
  formatter was reused and the fallback was never exercised
  (`Expected "Yesterday"`, received `"yesterday"`).
- `ActivityScreen.tsx` still re-exported `formatRelativeTime`, keeping the
  duplicate-helper arrangement that caused the bug in the first place.
- The fallback was undocumented and `formatRelativeTime` could still throw for
  non-string input such as `Symbol` or `null` (the latter produced
  `1/1/1970`).
- `npx expo-doctor` failed on a pre-existing patch mismatch.

All of the above is fixed below.

## 2. Root cause

Hermes ships a partial ECMA-402 implementation. Its documentation lists as
supported only `Intl.Collator`, `Intl.NumberFormat`, `Intl.DateTimeFormat`,
`Intl.getCanonicalLocales` and the locale-aware `String`/`Number`/`Date`
prototype methods; `Intl.RelativeTimeFormat` is explicitly **not yet
supported** (together with `Intl.PluralRules`, `Intl.DisplayNames`,
`Intl.ListFormat` and `Intl.Locale`).

Source: <https://hermesengine.dev/docs/intl/>

Expo SDK 57 / React Native 0.86 runs Hermes on Android, so
`Intl.RelativeTimeFormat` is `undefined`. The old helper called
`new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })` unconditionally,
which throws `TypeError: undefined cannot be used as a constructor` while the
activity view model is built — before React can render an error state, so the
whole screen crashed.

Two copies of the helper existed
(`ActivityScreen.tsx` and `src/presentation/utils/relative-time.ts`), and both
were unguarded. The drafts inbox uses the shared helper, so it carried the same
latent crash.

## 3. Final implementation

`src/presentation/utils/relative-time.ts` is now the single implementation and
is total (it never throws):

1. **Feature detection** — `resolveConstructor()` returns the constructor only
   when `typeof Intl.RelativeTimeFormat === 'function'`. A throwing getter or a
   missing `Intl` global yields `null`.
2. **Cache keyed on the constructor** — a formatter is built once and reused
   only while the global constructor is unchanged; replacing/removing the API
   drops the cache. A constructor that throws, or a formatter whose `format()`
   throws, is discarded and the fallback is used.
3. **Documented English fallback** when the API is unavailable.
4. **Invalid input returns `''`** — non-string, empty, `null`/`undefined`,
   unparsable timestamps and an invalid reference date render a blank label
   instead of throwing.
5. **Calendar-day arithmetic** in local time, so DST changes do not skew
   "Yesterday"/"N days ago".

`ActivityScreen.tsx` imports the shared helper; its duplicate implementation
and the re-export are gone. `toViewModel()` is unchanged otherwise.

### Supported labels

| Input | Intl available | Fallback |
|-------|----------------|----------|
| < 1 minute past | `Just now` | `Just now` |
| < 1 minute future | `In a few seconds` | `In a few seconds` |
| same day, < 1 hour | `N minutes ago` (localised) | `N minute(s) ago` |
| same day, >= 1 hour | `N hours ago` (localised) | `N hour(s) ago` |
| previous day | `yesterday` (localised) | `Yesterday` |
| next day | `tomorrow` (localised) | `Tomorrow` |
| 2–6 days away | `N days ago` / `in N days` (localised) | `N days ago` / `In N days` |
| older than 6 days | `Date.toLocaleDateString()` | `Date.toLocaleDateString()` |
| invalid timestamp | `''` | `''` |

Localisation: the Intl path keeps the previous device-locale behaviour.
The fallback is English-only and documented in
`docs/international-expansion.md` §2.5; older rows still use the device locale
through `Date.toLocaleDateString()`.

## 4. Repository Intl audit

- `Intl.RelativeTimeFormat`: the only unguarded constructor in the repo
  (two copies). Now guarded.
- `Intl.Segmenter`, `Intl.DisplayNames`, `Intl.ListFormat`, `Intl.PluralRules`,
  `Intl.Locale`: **not used anywhere** in `src/` or `app/`.
- `Intl.NumberFormat` / `Intl.DateTimeFormat` (locale formatter, timezone
  handler, spending limits): supported by Hermes and left unchanged. They use
  explicit date parts, not the unsupported `dateStyle`/`timeStyle`, and no
  `notation`/`style: 'unit'` options.
- `.at(-1)` (`assess-retention.usecase.ts`): supported by Hermes in RN 0.86.
- No `structuredClone`, `Object.hasOwn`, `toSorted`/`toReversed`,
  `Intl.Locale`, `WeakRef` or `Promise.any` usage found.

## 5. Files changed

| File | Change |
|------|--------|
| `src/presentation/utils/relative-time.ts` | Rewritten: feature detection, constructor-keyed cache, documented fallback, total function. |
| `src/presentation/screens/activity/ActivityScreen.tsx` | Duplicate helper and re-export removed; imports the shared helper. |
| `src/presentation/screens/__tests__/activity-screen.test.tsx` | Regression tests for a missing/throwing `Intl.RelativeTimeFormat`, formatter-cache recovery, every supported label, invalid inputs, and screen rendering with mixed timestamps. |
| `docs/international-expansion.md` | New §2.5 documenting Hermes Intl coverage and the fallback. |
| `CHANGELOG.md` | Dated entry for the fix. |
| `docs/NATIVE_BUILD_VERIFICATION.md` | Notes that device verification of this fix is still pending. |
| `package.json`, `package-lock.json` | `expo-notifications` `~57.0.23` → `~57.0.24` so `expo-doctor` passes (unrelated pre-existing mismatch). |

No SQLite, sync, encryption, navigation, OCR or financial logic was touched.

## 6. Verification

Environment: macOS, Node 24, Expo SDK 57.0.31, React Native 0.86.3,
TypeScript 6.0.3, Jest 29 with `jest-expo`.

| Gate | Command | Result |
|------|---------|--------|
| Typecheck | `npm run typecheck` | pass |
| Lint | `npm run lint` | pass |
| Unit tests | `npm test` | **221 suites / 4,935 tests passed** (activity suite: 16 tests) |
| SQL validation | `npm run db:validate` | pass (all SQL structurally valid) |
| Schema | `npm run db:verify` | pass (13 blocks, 41 tables) |
| Secrets | `npm run secret-scan` | clean |
| Expo health | `npx expo-doctor` | 21/21 checks pass |
| Web export | `npx expo export -p web` | pass (`dist/`) |
| Android bundle | `npx expo export -p android` | pass — Hermes bytecode `entry-*.hbc` (6.8 MB) produced |

The Android export is a Metro/Hermes compile check only. It does not execute
the app.

## 7. Device verification — still pending

No Android device or emulator is attached to this machine (`adb devices`
empty, no AVD), so the fix has **not** been verified on a physical device.
The remaining device checks are:

1. Open the Activity tab with several expenses and settlements from different
   days, including a row with a malformed timestamp.
2. Confirm labels read `Just now`, `N minutes ago`, `N hours ago`, `Yesterday`,
   `N days ago`, older rows as calendar dates, and that a malformed row shows a
   blank label while the rest of the list renders.
3. Open the drafts inbox, which uses the same helper.

## 8. Remaining limitations

- The fallback wording is English-only. Translated relative strings need an
  Intl-capable runtime or a future locale catalogue; no service was added.
- Rows older than six days now render a calendar date. This replaces the
  earlier "1 week ago" style in the drafts inbox and matches the required
  "Days ago → older calendar dates" behaviour.
- `expo-notifications` was bumped one patch version; the next APK/AAB build
  must be rebuilt from the updated dependency tree.
- The `.hbc` export proves the bundle compiles for Hermes, not that this
  device's Hermes build behaves identically at runtime.
