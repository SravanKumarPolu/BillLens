# BillLens

> Offline-first, receipt-aware shared expense app.

**Status:** v2.6.0 — release candidate (Phases 1–10 complete, three
production-hardening passes; v2.6.0 adds **bidirectional cloud sync**,
explicit financial-conflict resolution, and fixes four release-blocking
deployment defects). 4,671 tests passing across 183 suites. See
[`CHANGELOG.md`](CHANGELOG.md) and
[`docs/consistency-model.md`](docs/consistency-model.md).

## Quick start

> **Requires a custom Expo development build** (not Expo Go) because BillLens
> uses `expo-camera`, `expo-image-picker`, and (Phase 2) a share extension.
> Build a dev client with `npx expo run:ios` or `npx expo run:android`,
> or use EAS Build: `eas build --profile development`.

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
