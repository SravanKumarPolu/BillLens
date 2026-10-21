# BillLens

> Offline-first, receipt-aware shared expense app.

**Status:** v2.9.0 — release candidate (Phases 1–10 complete, three
production-hardening passes; v2.9.0 adds a tested **encrypted-sync core** (envelopes, device keys,
reference relay — not deployed or wired yet); v2.8.0 added **local data export,
retention rules and safe local deletion**; v2.7.0 migrated to **Expo SDK 57 / React Native 0.86 /
React 19.2**; v2.6.0 added **bidirectional cloud sync** and explicit
financial-conflict resolution). 4,790 tests passing across 197 suites. See
[`CHANGELOG.md`](CHANGELOG.md) and
[`docs/consistency-model.md`](docs/consistency-model.md).

## Quick start

> **Expo Go must match the project SDK.** This project is on **SDK 57**
> (`expo ^57.0.30`), which is what the current Expo Go ships, so the store
> build works as-is. If your client is older than the project, update Expo Go
> rather than downgrading the project.
>
> Node **20.19.4+ / 22.13+ / 24.3+** is required by React Native 0.86.
>
> No custom native modules are in use today — `expo-camera`,
> `expo-image-picker`, `expo-sqlite`, `expo-secure-store`, `expo-file-system`
> and `expo-crypto` are all included in Expo Go. A development build is only
> required once custom native code or a share extension is added:
> `npx expo run:ios` / `npx expo run:android`, or
> `eas build --profile development`.

```bash
# Install dependencies
npm install --legacy-peer-deps

# Copy env example and fill in your values
cp .env.example .env.local

# Start the Expo dev server (requires Expo CLI / Expo Go or a dev build)
npx expo start

# Quality gates
npm run lint
npm run typecheck
npm test
```

## Web build

The web target is a static export (`web.output: 'static'`):

```bash
npx expo export -p web   # → dist/
```

`expo-sqlite` compiles to WASM on web, so `metro.config.js` registers
`wasm` as an asset extension. The wa-sqlite runtime uses
`SharedArrayBuffer`, which means the **host must send**:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Without those headers the page loads but the database worker cannot
start. Document metadata lives in `app/+html.tsx` and
`src/presentation/web/PageHead.tsx`; private routes send `noindex`.

## Local-first guarantees

BillLens works with no account and no network: groups, members, expenses,
balances, settlements, export and retention all run on local SQLite. Cloud sync
is an optional Supabase relay — it never blocks boot, and device-to-device
delivery is **not** claimed. The full audit, sync design (including what is not
implemented), and deletion semantics are in
[`docs/local-first-architecture.md`](docs/local-first-architecture.md) and
[`docs/LOCAL_FIRST_ARCHITECTURE.md`](docs/LOCAL_FIRST_ARCHITECTURE.md).

## Project structure

See [`docs/architecture-overview.md`](docs/architecture-overview.md) for the
full architecture, layer responsibilities, and hard rules.

```
billlens/
├── app/                  # Expo Router routes (thin screens)
├── src/
│   ├── presentation/     # UI components, screens, forms
│   ├── application/      # Use cases
│   ├── domain/           # Entities, value objects, business rules
│   ├── infrastructure/   # SQLite, Supabase, OCR adapters
│   ├── services/         # Capture intelligence, parsers, analytics
│   ├── store/            # Zustand (ephemeral UI state)
│   ├── config/           # Env validation, app metadata
│   ├── constants/        # App-wide constants
│   ├── types/            # Shared branded types
│   └── utils/            # Pure utilities
├── supabase/             # Migrations, functions, config.toml
├── e2e/                  # Maestro flows
├── assets/
├── scripts/
└── docs/
```

## Tech stack

React Native · Expo · TypeScript · Expo Router · SQLite · Supabase ·
Zustand · TanStack Query · React Hook Form · Zod · Reanimated

## Development commands

| Command | Purpose |
|---------|---------|
| `npm start` | Start Expo dev server |
| `npm run android` | Start on Android |
| `npm run ios` | Start on iOS |
| `npm run lint` | Lint TypeScript |
| `npm run typecheck` | Type-check without emitting |
| `npm test` | Run Jest unit tests |
| `npm run prettier` | Check formatting |

## Environment variables

See [`.env.example`](.env.example). Never commit service-role keys or any
secret with "service", "admin", "private", or "secret" in the name.

## Phase 1 progress

See [Prompt 1 completion report](docs/architecture-overview.md) for what's
done so far. The full Phase 1 roadmap (10 prompts) is tracked there.
