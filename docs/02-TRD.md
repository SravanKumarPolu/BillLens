> **BillLens v2.25.0 | Repository-grounded documentation audit | 2026-10-23**  \n> Source snapshot: `BillLens(5).zip`. Statuses describe source inspection and previously documented tests; **no native device tests were executed during this audit**.  \n> These consolidated files supersede conflicting planning claims; historical files remain available.

# Technical requirements (TRD)

## Installed stack (package.json)
- Expo `~57.0.31`; React Native `0.86.3`; React `19.2.3`; Expo Router `~57.0.29`; TypeScript `~6.0.3`.
- SQLite `~57.0.4`; Zustand `^4.5.4`; Zod `^3.23.8`; optional Supabase `^2.45.0`.
- Camera `~57.0.6`, picker `~57.0.20`, native OCR `^2.0.0`, notifications `~57.0.24`.
- Noble curves/ciphers/hashes; optional relay reference in `src/infrastructure/relay-reference`.

## Architecture and lifecycle
`app/` routes → presentation hooks/screens → application use cases → domain interfaces/rules → infrastructure adapters. `src/infrastructure/composition-root.ts` and `src/store/services-registry.ts` provide service wiring. **SQLite is the primary local financial store**; `initAppServices()` must never await cloud availability to make local features usable. Use domain ports to isolate remote providers.

## Data and security boundaries
SQLite migrations live in `src/infrastructure/sqlite/schema.ts` (13 versions); schema changes must be additive and transactional. Sync operations and financial events require stable IDs, idempotent application, causal ordering and conflict review. Crypto primitives (Ed25519/X25519/XChaCha20-Poly1305) exist in `src/domain/sync-crypto`; do not claim end-to-end app sync until encrypted engine is wired to lifecycle and real devices tested. Relay stores opaque encrypted envelopes with bounded TTL, **not durable backups**. Device key storage and recovery need real-device verification and security review.

## Native runtime, performance and lazy loading
Expo Go cannot exercise arbitrary native modules or remote push; use a compatible development build for ML Kit, notifications and other native functionality. `src/infrastructure/notifications/notification-runtime.ts` detects Expo Go; optional notification imports are lazy. Preserve `docs/PERFORMANCE_AND_LAZY_LOADING_STANDARDS.md`: lazy-load OCR, export and remote clients; measure on device; avoid heavyweight route entry imports; never lazy-load critical financial validation.

## Data flow
Create/edit expense → validate currency/payers/splits → SQLite transaction and audit → recalculate balances → optional durable sync queue. Capture → temporary URI persistence → OCR/provider → draft with confidence → human review → explicit save. Settlement → pending → receiver confirmation → completed ledger effect; reversal is auditable. Optional encrypted relay: locally signed/encrypted event → temporary relay → member decrypt/verify/idempotent apply → conflict UI (currently incomplete).

## Future cloud strategy
Supabase code is retained as an optional adapter; do not force accounts or central financial database. Automatic remote sharing requires an approved free-tier relay deployment, explicit operational cost/TTL constraints, key recovery and security tests. No cloud provider credentials were supplied or deployed by this audit.
