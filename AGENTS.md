# BillLens — agent & contributor rules

## Architecture

- Layers: `src/domain` → `src/application` → `src/infrastructure` → `src/presentation`; `app/` routes are thin.
- Domain has no React/Expo/network imports. Application may not import infrastructure (tests included).
- SQLite is the primary store; Supabase and the encrypted relay are optional. Never block local use on cloud init.

## Quality gates (must pass)

```bash
npm run typecheck
npm run lint
npm test
npm run db:verify
npm run secret-scan
npx expo-doctor
npx expo export -p web
```

## Performance & lazy-loading

Follow `docs/PERFORMANCE_AND_LAZY_LOADING_STANDARDS.md`:

- no heavy feature imports in `app/_layout.tsx` or route files;
- optional services (OCR, sync clients, export, reports) created lazily;
- lists virtualised and paginated; new queries need a matching index;
- media thumbnails in lists, full resolution on demand;
- measure before/after; state build type and device;
- never defer validation required for a financial operation.

## Security & data

- Never log or export tokens, keys, receipt text or full financial payloads.
- Encrypted-sync changes must keep `docs/ENCRYPTED_SYNC_PROTOCOL.md` true.
- Destructive actions require guards + audit; retention never auto-deletes.

## Authoritative documentation and evidence rules (2026-10-23 audit)

- Read `docs/01-PRD.md` through `docs/09-DEPLOYMENT_PLAN.md` and `docs/REQUIREMENTS_TRACEABILITY.md` before changing affected features. Preserve specialised documents; consolidate instead of recreating or silently contradicting them.
- After every feature, schema, dependency, route, native integration or sync change, update the relevant canonical docs, traceability matrix, and `docs/FEATURE_MATRIX.md`/`docs/IMPLEMENTATION_PROGRESS.md` when their status changes.
- Inspect existing implementation first; smallest safe changes only. No gratuitous rewrites, dependency additions or paid services. Keep domain/application/infrastructure boundaries.
- Keep SQLite primary and functional offline. Never delete, reset, or auto-expire user financial data during a migration or a test; provide explicit user confirmation and backup options for destructive changes.
- Financial amounts use integer minor units. With positive meaning “owed to member,” `net = expense_paid - assigned_share + completed_settlements_sent - completed_settlements_received`; each completed transfer increases payer net and decreases receiver net. Preserve zero-sum per currency, idempotency and immutable audit history.
- Use lazy imports only where runtime-safe; avoid eager optional native modules, particularly notifications in Expo Go. Measure actual device performance instead of assuming native bundle splitting.
- Add regression tests for bug fixes; distinguish source inspection, mocked/unit, real SQLite, emulator, physical-device and deployed-backend verification. Never fabricate passing tests or label VERIFIED_ON_DEVICE without recorded execution.
- Preserve current core features, run available quality gates, and explicitly state any commands not run or blocked. Never imply a release is ready without physical-device, legal, signing and security gates.
- Respond in English; document user-visible risks and remaining blockers clearly.
