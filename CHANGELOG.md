# BillLens — Changelog

All notable changes to BillLens across Phases 1-10 are documented here.

## [2.6.0] — 2026-10-12

### Bidirectional cloud synchronization, real multi-user collaboration, conflict resolution & release-candidate hardening

The highest-priority gap from the v2.5.0 review — **push-only sync** — is now
closed: BillLens downloads remote changes incrementally, detects conflicts
explicitly, and keeps financial state consistent across devices. Additionally,
four release-blocking defects that would have broken live deployments were
found and fixed at the root. 183 suites / 4,671 tests green, `tsc` clean,
lint clean, secret-scan clean, all migrations structurally valid.

#### Bidirectional sync (CLOUD → DEVICE)
- New `SyncCursorRepository` + local migration **0007** (`sync_cursors`): durable per-collection download checkpoints; a crash between apply and save replays the page safely (apply is version-guarded and idempotent)
- New `SupabaseIncrementalDownloadPort`: keyset pagination on the `(updated_at, id)` watermark per entity collection (groups → members → invites → expenses → payers → splits → settlements), tombstone mapping (soft deletes are never communicated by absence), RLS-scoped via the signed-in user's JWT
- New `DownloadCoordinator`: parent-first pulls, per-page cursor persistence, bounded work per run, corrupt-cursor recovery (full re-download), **5-minute late-commit overlap window** for long-running transactions
- New `SqliteRemoteChangeApplier`: the CLOUD→DEVICE write path — driven by the pure `reconcileChange` rules, writes remote rows verbatim, **never enqueues upload ops (no echo loop)**; a child whose parent is missing is DEFERRED (cursor holds — a financial record is never dropped); remote child rows are suppressed while the parent expense has a pending local edit; group-member tombstones map to the local `left_at` model; unknown settlement methods normalise to `other` for the local CHECK
- `SyncCoordinator` runs push-then-pull per run; `SyncRunResult` carries download counters; `resetFullSync()` for manual full re-sync; last download error surfaced honestly

#### Multi-user collaboration & conflict resolution
- Download-detected conflicts record BOTH versions (local + cloud payloads) and are replay-idempotent (one unresolved conflict per entity)
- New `ResolveRemoteConflictUseCase` + applier operations: **Keep mine** re-bases the local edit onto the cloud version (row := cloud+1, op base := cloud) and requeues deterministically; **Use cloud** writes the cloud payload verbatim and cancels the stale local ops — financial fields are never auto-merged
- Two-device integration suite (`bidirectional-sync-integration.test.ts`): offline create → push → pull → **identical balances on both devices**; tombstone propagation; concurrent-edit conflict (exactly one conflict, no duplicates); offline restart recovery; idempotent retries; revoked-member visibility
- Sync status screen: "Review conflicts" section with per-conflict decisions, honest download-error surfacing, and a safe "Full re-sync" action; app-state store counts remote conflicts

#### Release-blocking defect fixes (all would have failed in production)
1. **`supabase db push` still failed on a clean project** — the RLS policies reference `group_members.deleted_at`, which NO migration ever created (~45 references). New migration `202610110900_group_members_soft_delete.sql` (sorted before the RLS migration) adds the column and backfills `left_at` members as tombstones.
2. **Every group/member/settlement upload would have failed with 23502** — the upload payloads were missing NOT NULL columns (`client_created_at` / `client_updated_at` / `last_modified_by` / timestamps). All four payload builders (`groupToPayload`, `memberToPayload`, `settlementSyncPayload`, expense aggregate children) now produce complete cloud rows.
3. **`sync_conflicts` CHECK crashed the device sync loop** — the coordinator writes conflict categories (`permission_changed`, `parent_deleted_remotely`, …) that migration 0001's CHECK rejected; every such conflict record threw on a real device. Migration 0007 rebuilds the table with the aligned CHECK (+ `remote_change_conflict` for the download side).
4. **Server `updated_at` used `now()` (transaction-start) and ignored client-supplied values on INSERT** — the pull cursor needs commit-ordered timestamps. Migration `202610111100_bidirectional_sync_server.sql` switches the trigger to `clock_timestamp()` (BEFORE INSERT OR UPDATE) and adds the keyset pull indexes.

#### Supabase & deployment
- `docs/deployment.md`: new §3.0 probe block (trigger/index/column checks) and §3.3 — the exact TEN-step two-account live verification protocol (join → consistent balances → settlement → concurrent edit → offline → revocation → negative-authz REST probe)
- `docs/consistency-model.md` (NEW): the authoritative consistency model, its tradeoffs (timestamp watermark polling, single-writer conflicts, download scope) and the full test map
- Dependency audit re-triaged: 0 direct vulnerabilities, 0 critical; remaining advisories are transitive build/toolchain chains (jest/expo internals) unchanged from v2.5.0 — they resolve with a device-verified SDK upgrade, deliberately not forced here

#### Verification (2026-10-12)
- `npm ci` ✅ · `npx tsc --noEmit` ✅ 0 errors · `npm run lint` ✅ 0/0 · `npm test -- --runInBand` ✅ **183/183 suites, 4,671/4,671 tests** (+3 new suites, +63 tests vs v2.5.0) · `npm run db:validate` ✅ 5/5 migrations · `npm run secret-scan` ✅ CLEAN · `npm audit` triaged (0 direct / 0 critical)
- Live Supabase auth/RLS/sync, live OCR, and device E2E remain externally gated (provisioned project, Vision credential, simulator/emulator) — exact steps documented; nothing was fabricated.

## [2.5.0] — 2026-10-12

### Release-candidate verification pass (production OCR guard → Supabase/RLS hardening → sync-engine correctness → UI/UX → release prep)

A verification-first pass over the complete v2.4.0 application: every subsystem was
independently re-audited, verified defects were fixed at the root cause, and the
release configuration was completed. No redesign, no architecture change, no
regressions — 178 suites / 4,608 tests green, `tsc` clean, lint clean,
`expo-doctor` 18/18.

#### Phase 1 — Production OCR guard (mock can never masquerade as real)
- `resolveOcrProvider` gains `allowMock` — production builds (`EXPO_PUBLIC_APP_ENV=production`) can NEVER select the mock processor: forced-remote-unconfigured and mock-in-production now resolve to an explicit `unavailable` state instead of silently serving sample data
- New `UnavailableCaptureProcessor` (fail-loud, typed `NOT_CONFIGURED`) replaces the mock as the composition-root default — a forgotten injection can no longer fabricate financial values
- `OCR_UNAVAILABLE` pipeline code + dedicated "Receipt scanning unavailable" processing state (manual entry as the primary recovery action; no pointless Retry)
- DEMO banner on the draft review screen when a draft came from the mock processor (development/staging only by construction)
- Edge Function hardening: in-function JWT verification (guest anon-key or user token), stub provider REFUSED unless `OCR_ALLOW_STUB=true` (old default served fabricated high-confidence receipts when misconfigured), early Content-Length rejection
- `.env.example` documents the full selection matrix

#### Phase 2 — Supabase & RLS hardening (fresh-deploy + privilege fixes)
- **Fixed migration-blocking defects**: `202610101500` referenced nonexistent `group_members.profile_id` (6 policies — a fresh `supabase db push` FAILED at this migration, so the entire RLS posture could not be provisioned); `202610111000` revoked a wrong audit-function signature (aborting the whole policy migration)
- `group_members_insert_self` now requires an ACTIVE invite (pending, unrevoked, unexpired, uses remaining) — any authenticated user could previously join ANY group by id; `group_members_update_self` gained `WITH CHECK` pinning self-updates to plain member rows (no group rewriting, no self-promotion)
- `groups_update_member` is owner-gated (any active member could previously rename/archive a group via direct REST)
- Receipt-image storage bucket + owner-namespaced policies (`<uid>/…` prefix enforcement) staged for when cloud receipt upload lands
- Account-deletion cloud half: `billlens_purge_expired_accounts()` SECURITY DEFINER RPC (+ pg_cron schedule snippet) — v2.4.0 wrote deletion requests to local SQLite only and never purged remote data

#### Phase 3+4 — Sync-engine correctness (critical) & financial integrity
- **Queue never drained (critical):** `listReadyForRetry` selected only `status='failed'` — freshly enqueued `pending` operations (every new expense/settlement/group) were never uploaded. Fixed + parity regression tests
- **Schema rejected its own writes:** local migration 0006 rebuilds `sync_operations` (full status/entity/operation CHECKs + missing `updated_at`); `markPermanentlyFailed`/`cancelOperation` previously THREW on device, crashing the sync loop (hidden by the constraint-free test double, which now supports drop/rename/insert-select)
- **Aggregate payloads could not upload:** the sync port flattens `{expense, payers, splits}` / `{settlement}` per entity type; delete ops no longer spread non-column payload keys
- **Idempotent create retries:** 23505 on create resolves against our row id — a server-accepted-but-response-lost write is SUCCESS, not a phantom conflict
- **Auth expiry no longer dead-ends the queue:** 401/PGRST301 → retriable `AUTH_TOKEN_EXPIRED` (was `DELETED_REMOTELY` → user-review conflict); `getAccessToken` refreshes expired JWTs through the wired AuthService before retry
- Coordinator: full boot recovery of stuck `syncing` ops (5-min threshold removed), rich conflict records (entity/version/payloads/category — previously `entity_type='unknown'` with null payloads), retry TIMER so scheduled backoffs actually fire, retry cap single-sourced (`MAX_SYNC_RETRIES=10`, was 8-vs-10 drift)
- Deny-all tables (`receipt_privacy_preferences`, `settlement_state_history`) no longer mapped — unmapped types fail fast instead of burning 10 retries each
- Sync status surfaced honestly: `app-state-store.refreshSyncStatus()` polls REAL queue counts (pending vs needs-review as distinct counters), 15s watcher in ServicesGate, reachable `/settings/sync` route with retry/retry-all/sync-now wired to the coordinator, settings row, dashboard counters unaliased (pending was previously mislabeled "failed")
- Financial: `explainMemberBalance` no longer crashes for debtors (`Money.multiply(-1)` rejected); group-currency invariant enforced on BOTH expense write paths; reversal pair committed atomically via UnitOfWork; receiver-only settlement confirmation enforced in the use case; multi-payer OCR drafts confirmable (first candidate + review); currency-aware display formatters (balance explanations, accounting/CSV/OFX exports, calendar events, payment links — JPY/KWD-scale correct)

#### Phase 5 — UI/UX
- `Screen` gains `avoidKeyboard` (KeyboardAvoidingView, iOS padding / Android height) — enabled on Add Expense, New Settlement, Draft Review, Guest name, Join group, Group settings; the focused input is no longer covered by the keyboard on iOS
- New honest states: "Receipt scanning unavailable" (with manual-entry primary action), DEMO mock-data banner, needs-review sync counters
- Verified unchanged (already sufficient): light/dark/system themes, safe areas, 44pt targets, money font-scaling cap, reduced-motion, bounded lists (≤50), keyboard-tap persistence

#### Phase 6 — Dependencies, performance & security
- `npm audit fix` applied (safe range only); remaining advisories are 100% transitive build/toolchain (Expo/metro/jest internals) — **0 direct advisories, 0 affected shipped runtime dependencies** (supabase-js, zustand, react-query, zod, react-hook-form, async-storage, secure-store, sqlite all clean); breaking SDK upgrade deliberately deferred (needs device verification)
- Android release permissions modernized (CAMERA only explicit; expo-image-picker injects the correct media permission per target SDK — the legacy READ/WRITE_EXTERNAL_STORAGE pair is gone)
- Log-leak spot check clean: no tokens/images/amounts in logs; console.warn/error only

#### Phase 7 — Verification gate (all re-run from clean install)
- `npm ci` reproducible · `tsc --noEmit` 0 errors · `eslint` clean · **178/178 suites, 4,608/4,608 tests** (+27 tests vs v2.4.0) · `expo-doctor` 18/18 · `expo install --check` clean · `secret-scan` CLEAN · `db:validate` all valid

#### Phase 8 — Release configuration
- `app.config.ts`: version 2.5.0 (was stale 2.2.0), `ios.buildNumber` + `android.versionCode` floors, permission cleanup
- `package.json` → 2.5.0; `eas.json` verified (internal APK profile, staging/production app-bundle + autoIncrement, credential placeholders only)
- Deployment guide (`docs/deployment.md`), release checklist (`docs/release/release-checklist-v2.5.0.md`)

#### Honest status (unchanged blockers)
- Live OCR / live cloud sync / RLS enforcement verification require a provisioned Supabase project + Cloud Vision credential — code-side complete, externally BLOCKED, documented step-by-step
- Maestro E2E on simulators/devices NOT EXECUTED (no device host in this environment) — flows + manual plan in `e2e/`
- Push-only sync (no incremental download adapter yet) — documented known limitation for the RC

## [2.4.0] — 2026-10-11

### Eight-phase production-hardening pass (OCR → identity/cloud → financial precision → dashboard reliability → Expo SDK 54 → accessibility → security/offline → E2E verification)

Every change is additive or a verified-defect fix — the offline-first architecture,
financial correctness model and Modern-SaaS/Minimalism/Bento design direction are preserved.

#### Phase 1 — Real OCR pipeline
- `ProcessCaptureUseCase` (hash → duplicate policy → persist → extract → reviewed draft), `SaveExpenseDraftReviewUseCase`, `GetExpenseDraftReviewUseCase`, `evaluateImageQuality`
- `RemoteOcrCaptureProcessor`: zod-validated wire contract, timeout, bounded retry with backoff + jitter + Retry-After, cancellation (AbortSignal), typed error taxonomy, minor-unit money
- Deployable Supabase Edge Function `supabase/functions/ocr-receipt` (Google Cloud Vision + stub providers, heuristic parser); provider credentials stay server-side — never in the app bundle
- `ExpoImageDataReader` / `ExpoImageHasher` (SDK 54 `File`/`Paths` API, canonical sha256 hash), provider selector (`EXPO_PUBLIC_OCR_MODE`)
- Processing / image-quality / draft-review screens wired to the real pipeline (stale-attempt guards, abort on unmount, duplicate routing)
- Live OCR requires a provider credential on the deployer's Supabase project — mock provider is the default and is fully tested (live path honestly BLOCKED without credentials; documented in the edge-function README)

#### Phase 2 — Production identity & cloud
- `SupabaseAuthenticationProvider` (session get/refresh, email OTP, Google/Apple OAuth, AuthState events) + `GuestAuthenticationProvider` null-object
- Fixed `SupabaseRemoteSyncPort` defects: env names (`EXPO_PUBLIC_SUPABASE_URL`), NOT_CONFIGURED error code, session binding via accessToken factory
- Local migration v5 (guest_identities, account_deletion_requests), `ExpoLocalDataWiper` (images + SQLite + SecureStore + persisted stores), account-deletion flow end-to-end offline
- RLS migration covering all 25 cloud tables (group-membership scoped SELECT, owner-gated mutations, WITH CHECK on inserts), profiles auto-provisioning trigger, audit functions
- Honest status: cloud adapters code-complete + unit-tested with mocks; LIVE cloud verification BLOCKED on a provisioned Supabase project (documented)

#### Phase 3 — Financial precision & correctness
- Overpayment guard wired into the settlement flow (the one real gap): typed `SettlementOverpaymentError`, explicit confirm-anyway for intentional pay-ahead, warning auto-dismisses on edit — domain rules unchanged
- Property test P8: all four split ways preserve totals across every currency scale (0/2/3 decimals) + 1-minor-unit boundary
- Verified (reused as-is): integer-minor-unit Money VO, deterministic largest-remainder splits, item-split tax/tip/discount validation, payer/split aggregate invariants, settlement idempotency (operationId + paymentReferenceHash)

#### Phase 4 — Dashboard reliability
- Silent per-group catches now record `degradedGroupIds` / `balancesUnavailableGroupIds` — zero vs unavailable is distinguishable; partial data is never presented as an authoritative "all settled up"
- Stale-response epoch guard (superseded loads discarded), `retry()` action, stale-while-revalidate refresh
- "Balances unavailable" card with Try again; partial-degradation notice banner; same guard added to the group dashboard hook
- Test mock fidelity fix: expo-router `useFocusEffect` mock now matches real semantics (previously fired load on every render, masking races)

#### Phase 5 — Expo SDK
- Verified: expo@54.0.37 (SDK 54) with react-native 0.81.5 / react 19.1.0 — the 51→54 upgrade, modern `File`/`Paths` APIs, `expo-doctor` 18/18, `expo install --check` clean

#### Phase 6 — UI/UX & accessibility (necessary improvements only)
- Font scaling: money variants capped at 1.5x (a wrapped figure is less readable, not more), everything else uncapped; money entry inputs capped; overrides per instance
- `useReducedMotion` hook (OS reduce-motion, live subscription); camera press-scale and processing pulse honor it
- `keyboardShouldPersistTaps="handled"` on scrollable screens
- Verified already-present: light/dark themes, safe areas, 44pt touch targets, screen-reader labels, loading/empty/error/offline states; no new design dependencies

#### Phase 7 — Security & offline (audit; verified fixes only)
- FIXED: `CreateSettlementDraftUseCase` group-level access control — payer AND receiver must be active members of the target group (check runs before the idempotency probe, no operationId existence oracle)
- Audited clean (no action needed): SQL parameter binding, token storage (SecureStore only, THIS_DEVICE_ONLY), receipt-image privacy gating, input validation, idempotent writes, optimistic concurrency, offline queue crash recovery + retry policy + three-way-merge conflicts, log redaction, secret scan

#### Phase 8 — E2E verification (official gate)
- `npm ci` reproducible; `tsc --noEmit` 0 errors; `eslint` 0/0; `jest --runInBand` 177 suites / 4,581 tests PASS; `expo-doctor` 18/18; secret-scan CLEAN; `db:validate` PASS
- Maestro device E2E: flows exist but BLOCKED in this environment (no simulator/emulator/Maestro CLI) — manual steps in `e2e/README.md`

**Gate totals: 177 suites / 4,581 tests (+10 suites, +168 tests vs v2.3.0) — 0 type errors, 0 lint findings.**

## [2.3.0] — 2026-10-11

### Source-Level Completion Pass — closes the six identified gaps additively

This increment closes the six gaps identified in the source-level audit:
settlement recording, camera + gallery flows, dashboard real balances +
pending actions, Activity timeline, Expense Detail, Settings completion,
BentoGrid + classic-elegant palette, and full verification. Every change
is **additive** — no existing behaviour was rewritten. Gate chain after
the change: **0 type errors, 0 lint warnings, 167 suites / 4,413 tests
(+14 suites, +122 tests), clean secret scan, valid migrations, successful
Android export (3.98 MB Hermes).**

#### Added — application layer
- `src/application/groups/create-group.usecase.ts` — `CreateGroupUseCase`:
  writes group + owner member to the SQLite repository atomically (with
  audit-log + sync-op). The owner member's `userId` is set to the
  supplied `createdBy` (the synthetic 'local-user' pre-identity) so the
  dashboard can find "my member" per group.
- `src/application/activity/list-recent-activity.usecase.ts` —
  `ListRecentActivityUseCase`: merges expenses + settlements across the
  supplied group ids, ordered by timestamp DESC. Per-group failure
  resilience — a single group's load error does NOT abort the timeline.
- `src/application/expenses/get-expense-detail.usecase.ts` —
  `GetExpenseDetailUseCase`: loads expense + payers + shares with member
  display names resolved. Throws on missing / deleted expenses.

#### Added — presentation hooks
- `src/presentation/hooks/use-group-members.ts` — loads a group's name +
  currency + active members via `ListGroupMembersUseCase`. Re-loads on
  services-ready and on screen focus.
- `src/presentation/hooks/use-settlement-form.ts` — wraps the two-step
  `createSettlementDraft` → `recordSettlement` flow with
  `crypto.randomUUID()` operationId for offline idempotency. Currency-
  aware amount parsing (JPY=0, KWD=3, USD=2; rejects extra decimals
  rather than silently truncating).
- `src/presentation/hooks/use-home-dashboard-data.ts` — aggregates
  pending-confirmation settlements + suggested-settlement counts +
  per-user net balances across all groups. Per-group failure resilience.
- `src/presentation/hooks/use-activity-feed.ts` — loads the unified
  recent-activity timeline across all groups via the new
  `ListRecentActivityUseCase`.
- `src/presentation/hooks/use-group-pending-confirmations.ts` — loads
  pending-confirmation settlements for a group + exposes
  `confirm()` / `dispute()` callbacks that call the matching use cases.

#### Rewritten — presentation screens (placeholders replaced with real data)
- `NewSettlementScreen` — rewired to call `createSettlementDraft` +
  `recordSettlement` through the services registry. Removed the stub
  `setTimeout(500); router.back()` and the hardcoded `members: [] = []`.
- `NewGroupScreen` — rewired to call the new `CreateGroupUseCase`
  (writes group + owner member to SQLite + audit + sync-op) before
  updating the persisted UI store (write-through cache).
- `ActivityScreen` — replaced the `PlaceholderScreen` with a real
  unified timeline of expenses + settlements across all groups.
- `ExpenseDetailScreen` — replaced the `PlaceholderScreen` with a real
  expense detail view: total hero, payer breakdown, share breakdown,
  invariant totals, note/category.
- `SettingsScreen` — replaced the `PlaceholderScreen` wrapper with six
  real sections: Appearance (theme), Receipts (storage mode),
  Diagnostics, Feedback, Account, About.
- `GroupBalancesScreen` — rewired to load real member balances via
  `useGroupDashboardData` + added the receiver-side "Pending your
  confirmation" section with Confirm/Dispute buttons that call
  `confirmSettlement` / `disputeSettlement` use cases.
- `GroupSettingsScreen` — rewired the Members card to load real
  members via `useGroupMembers` (was hardcoded "You / Owner").
- `SettlementPreviewScreen` — added `groupId` route param; loads real
  group members + balances via the services registry; `handleConfirm`
  now calls `createSettlementDraft` + `recordSettlement` (was a stub
  `Alert.alert` + `router.back()`).
- `HomeDashboardScreen` — the "Your balances" card now renders real
  per-user balances (sum of "my member" `netBalanceMinor` per currency
  across all groups). Pending-action cards now surface real
  pending-confirmation + outstanding-balances counts.

#### Added — capture flow (real surfaces, not placeholders)
- `src/presentation/screens/capture/CameraScreen.tsx` — real viewfinder
  using `expo-camera`'s `CameraView` + `useCameraPermissions()` hook.
  Animated shutter button. On capture → navigates to
  `/capture/image-quality?imageUri=…&mode=…&groupId=…`.
- `src/presentation/screens/capture/GalleryPickerScreen.tsx` — real
  picker using `expo-image-picker`'s `launchImageLibraryAsync`. Handles
  permission denied, cancelled, and failure states honestly.
- `CaptureEntryScreen.useAutoAdvance` — activated (was a no-op stub).
  Deep links to `?source=gallery|payment|scan` now navigate to the
  matching real surface via `router.replace`.

#### Added — design system
- `src/presentation/design-system/components/BentoGrid.tsx` — new
  2-column bento layout primitive (collapses to 1 column on tablet).
  `computeBentoTileWidth(span, containerWidth, gap)` helper for tests.
- Refined the colour palette toward "classic and elegant": warm ivory
  backgrounds (`#FAF8F5`), deep slate text (`#1A1B25`), ink indigo
  brand (`#2B3A8C`), desaturated semantic colours (forest green
  positive `#3F7A5E`, deep red negative `#A8323C`, bronze warning
  `#B07A1E`). Dark mode mirrors the light mode with deep warm-slate
  backgrounds + soft ivory text. Semantic / brand colours IDENTICAL
  across both modes (the original design invariant).
- Applied `BentoGrid` to the dashboard's "Your balances" cards and the
  group home's primary-actions row.

#### Tests added (+14 suites, +122 tests)
- `use-settlement-form` integration (9 tests) + view (12 tests).
- `use-group-members` integration (4 tests).
- `use-home-dashboard-data` integration (6 tests).
- `use-group-pending-confirmations` integration (7 tests) — verifies
  `confirm()` persists `completed` + `dispute()` persists `disputed`.
- `use-activity-feed` integration via `ListRecentActivityUseCase` (7
  tests) + `ActivityView` view (8 tests).
- `GetExpenseDetailUseCase` integration (4 tests) +
  `ExpenseDetailScreenView` view (10 tests).
- `SettingsScreen` view (10 tests) + container wiring (5 tests).
- `CameraScreen` view (11 tests) + `GalleryPickerScreen` view (6 tests).
- `BentoGrid` helper (4 tests).
- `CreateGroupUseCase` integration (7 tests).
- Updated `GroupBalancesView` (+4 view tests) + `GroupSettingsView`
  (+4 view tests for real members, loading, error, empty states).

## [2.0.3] — 2026-10-10

### Write-Side Repository Adapters — the persistence core (next increment after 2.0.2)

The four core entity repositories now exist as production SQLite
adapters, wired through the composition root's new `repositories`
bucket. Everything landed **additively** — no existing behaviour was
rewritten. Gate chain after the change: **0 type errors, 0 lint
warnings, 145 suites / 4,184 tests (+21), clean secret scan, valid
migrations, successful Android export (3.66 MB Hermes).**

#### Added — repository infrastructure
- `src/infrastructure/sqlite/sqlite-group-repository.ts` —
  `GroupRepository` adapter: upsert save, two-step membership join for
  `listByUser` (join-free SQL, works on both engines), active-only
  listings, numeric-offset pagination, idempotent soft deletes.
- `src/infrastructure/sqlite/sqlite-group-member-repository.ts` —
  `GroupMemberRepository` adapter: active/owner queries, `updateRole`
  (no-op on same role, rejects left members), `left_at`-based soft
  delete with history preservation.
- `src/infrastructure/sqlite/sqlite-expense-repository.ts` —
  `ExpenseRepository` adapter. `save()` writes the expense + full
  payers/splits replacement in ONE transaction; `countByPayer` counts
  only payers of non-deleted expenses (two-step join-free SQL).
- `src/infrastructure/sqlite/sqlite-expense-draft-repository.ts` —
  `ExpenseDraftRepository` adapter. Draft body (`draft_data` JSON:
  candidates, line items, charges, editable fields) + fixed columns
  (status, confidence basis points, unresolved issues, confirmed
  links). Drafts stay local-only — no `SyncEntityType` exists for
  capture artifacts yet.
- `src/infrastructure/sqlite/row-mappers.ts` — shared row→entity
  mappers, id generation, and the numeric-offset pagination helper
  matching the application-layer cursor convention.

#### Changed — atomicity and reuse
- `src/infrastructure/sqlite/sync-op-writer.ts` (new) — the ONE
  implementation of the `sync_operations` enqueue insert;
  `SqliteSyncRepository.enqueue()` now delegates to it. Every group /
  member / expense mutation enqueues its sync operation INSIDE the same
  transaction as the entity write (the schema's documented atomicity
  requirement). Expense ops carry the full aggregate payload.
- `src/infrastructure/composition-root.ts` — new `RepositoryServices`
  bucket exposing `groups` / `members` / `expenses` / `drafts`, wired
  to the caller-supplied `DatabaseConnection`.
- `src/infrastructure/__tests__/in-memory-database.ts` — three
  additive SQL features for the test double: parameterized `in (?, …)`
  lists, `limit ? offset ?` (positional params), and `> ?` comparisons.
  Existing behaviour unchanged (all previous suites pass unmodified).

#### Tests — 21 new
- `sqlite-write-repositories.test.ts` (19): round-trips at the SQL
  layer (via the real migration runner), update-in-place vs duplicate
  rows, replace-all payer/split semantics, mid-transaction sabotage →
  full rollback with zero sync-op residue, idempotent soft-delete
  replays, active-membership and tombstone filtering, cursor
  pagination, strict-since incremental reads.
- `composition-root.test.ts` (+2): `repositories` bucket present; the
  write→read coherence proof — group + members + expense saved through
  the adapters are immediately visible to the Phase 6 balance engine
  (Alice +500 / Bob −500) with all four sync ops enqueued atomically.

#### Not wired (honest scope note)
- Settlement write-side, identity (guest/user), audit, and deletion
  adapters; application-layer create-group / create-expense use cases;
  screen write-through. These are the next increments; nothing in this
  release fakes them.

## [2.0.2] — 2026-10-10

### Composition Root Wiring — the DI bridge (Known Limitation RISK-WIRE-01)

The one remaining *code-level* known limitation from 2.0.1 is now
closed additively: the composition root exists, is mounted at app
start, and is executed by tests end-to-end. No Phase 1-8 behaviour was
rewritten. Gate chain after the change: **0 type errors, 0 lint
warnings, 144 suites / 4,163 tests, clean secret scan, valid
migrations, successful Android export (3.61 MB Hermes).**

#### Added — composition infrastructure
- `src/infrastructure/composition-root.ts` — the doc-prescribed (§7)
  single wiring point. Builds the **balances** bucket (all 7 Phase 6
  use cases), the **explanations** bucket (all 6 Prompt 56 use cases),
  the **sync** bucket (`SyncCoordinator` over SQLite repo + Expo
  connectivity + Supabase remote sync), the **capture** bucket, and
  the **session** bucket — strictly from implementations that exist;
  nothing is faked. Pure factory: unit-testable with in-memory
  adapters, expo imports never cross into the graph.
- `src/infrastructure/sqlite/expo-sqlite-database.ts` — the production
  `DatabaseConnection` driver over expo-sqlite (async API, PRAGMA
  foreign_keys on open, transaction mapping). The only file importing
  expo-sqlite.
- `src/infrastructure/security/expo-secure-store.ts` — production
  `SecureStorage` over expo-secure-store (this-device-only keychain).
- `src/store/services-registry.ts` — the presentation↔infrastructure
  bridge that keeps the boundary closed: presentation may not import
  `@infrastructure/*`, but may import `@store/*`. Publishes the graph
  once (`initAppServices()`), exposes `getAppServices()` /
  `tryGetAppServices()` / `useAppServicesReady()`, sync-coordinator
  start/stop helpers, and a clean test seam
  (`configureAppServicesFactory` / `setAppServicesForTesting`).
- `src/presentation/components/ServicesGate.tsx` — boots the graph in
  `app/_layout.tsx`, arms offline sync, soft-fails with a retry banner
  (storage errors never blank the app).

#### Changed — screens read real data
- `HomeDashboardScreen` — recent-groups cards now render live from the
  persisted group store (non-archived, newest-first, capped at 3),
  replacing the Phase 2 hardcoded empty arrays. Balance cards stay an
  honest zero state until the write-side repository adapters land;
  the query path itself is live through the composition root.

#### Tests — 16 new
- `composition-root.test.ts` (9): full graph build, session round-trip,
  GetGroupBalances/GetMemberBalance end-to-end over seeded financial
  data (Alice +500 / Bob −500 INR), settlement suggestion generation,
  invariant validation green, override seams, graph independence.
- `services-registry.test.ts` (7): idle/ready/error lifecycle,
  idempotent init, factory-failure recovery, no-op sync helpers,
  test-injection seams.
- `home-dashboard.test.tsx` (+3): container renders real group-store
  data, cap/sort/archived exclusion, first-run empty state preserved.

## [2.0.1] — 2026-10-10

### Phase 8 Packaging Remediation — Security, Testing & Launch (Prompts 71-80)

An evidence-based audit against the Phase 8 requirements found nine gaps
between the previous status claim and reality. All closed additively —
no Phase 1-7 verified behaviour was rewritten. Gate chain after the fix:
**0 type errors, 0 lint issues, 142 suites / 4,144 tests, clean secret
scan, valid migrations, successful Android export.**

#### Fixed — build blockers
- `assets/` was empty while `app.config.ts` referenced
  `icon/adaptive-icon/splash/favicon.png` — `expo export` and EAS builds
  failed. Regenerated all four assets (brand gradient + receipt/lens
  motif).

#### Fixed — security gate wiring
- `scripts/secret-scan.js` existed but `npm run secret-scan` was never
  wired into `package.json` — the gate could be silently skipped. Now
  part of `precommit` and both CI workflows.
- Applied non-breaking `npm audit fix` (production-tree findings
  80 → 74; all remaining are Expo CLI build-toolchain transitives —
  zero in shipped runtime dependencies; breaking downgrades forbidden
  by Phase 8 rules).
- Fixed 3 pre-existing lint warnings (`import()` type annotations) in
  Phase 6 use-case files.

#### Added — release infrastructure (Prompt 76)
- `eas.json` — development / internal / preview / staging / production
  build profiles + submit config.
- `.github/workflows/ci.yml` — install → lint → typecheck → tests →
  migration test → secret scan → dependency audit → export smoke.
- `.github/workflows/release.yml` — full gates → manual production
  approval environment → EAS Android + iOS builds → tagged release.

#### Added — account deletion (Prompt 77; Apple 5.1.1(v) / Play policy)
- `AccountDeletionRequest` domain entity (scheduled / cancelled /
  completed; 1-30 day recovery window bounds).
- `AccountDeletionRepository` + `LocalDataWiper` application ports.
- `RequestAccountDeletionUseCase` — guests: explicit-confirm +
  immediate local wipe; accounts: schedule 14-day deletion + revoke
  sessions + audit (no sensitive content).
- `CancelAccountDeletionUseCase` + `GetAccountDeletionStatusUseCase`.
- `DeleteAccountScreen` (consequences, recovery window, two-step
  confirmation) + `/settings/delete-account` route + Settings entry
  point.
- 14 new tests; suite total 4,144.

#### Added — E2E + store + legal + reports (Prompts 77-80)
- `e2e/maestro/phase8/` — all 23 Prompt 80 release flows (13 authored,
  10 canonical aliases into phase6/7 suites) + README index.
- `store/` — App Store listing, Play listing + Data Safety, reviewer
  notes, privacy-disclosure ↔ code map, screenshot plan.
- `docs/legal/` — privacy policy, terms of service, acceptable use,
  data retention, account deletion, security overview, OSS licences
  (all DRAFT for legal review) + README gate.
- `docs/release/` — all 12 Prompt 80 reports from executed evidence
  (production-readiness, security/privacy/accessibility audits,
  performance, test summary, migration, store checklist, incident
  response, rollback, known limitations, launch decision).
- Launch decision recorded honestly as `NOT READY FOR RELEASE` until
  device/beta/legal execution gates close (`launch-decision.md`).

## [2.0.0] — 2026-10-10

### Phase 6 Remediation — Settlements, Balances & UPI (Tracks 1-7)

This release implements the complete Phase 6 remediation identified in the October 2026 audit. All 10 prompts (51-60) are now fully implemented with 562 new tests and 28 new documentation files.

#### Track 1 — Settlement State Machine (Prompt 52)
- 8-state lifecycle: draft, requested, pending_confirmation, completed, failed, cancelled, disputed, reversed
- 13 valid transitions with `assertValidTransition` guard
- `contributesToCompletedBalance(status)` — the balance-engine contract (only `completed` contributes)
- `Settlement` entity extended with `status`, `confirmedByMemberId`, `confirmedAt`, `paymentReferenceHash`, `operationId`, `evidenceHash`, `disputeReason`, `disputeNote`
- `SettlementMethod` extended with `card` and `wallet` (6 total)
- 11 use cases: CreateSettlementDraft, Request, Record, Confirm, Reject, Cancel, Reverse, Delete, Restore, RetryAsDraft, Get, List
- SQLite migration 0002 + Supabase migration (additive columns + 3 new tables)
- 132 new tests, 2 doc files (settlement-domain.md, settlement-lifecycle.md)

#### Track 2 — Explanation Engine (Prompts 53, 55)
- `GenerateSettlementSuggestionsUseCase` — per-currency suggested transfers with `reasonCode: direct_debt | simplified_debt`
- `PreviewSettlementImpactUseCase` — before/after balances with `isFullSettlement`, `isPartial`, `isOverpayment` flags
- `ExplainMemberDebtUseCase` + `ExplainMemberCreditUseCase` — per-expense breakdown
- `GetSuggestedTransferExplanationUseCase` — structured reasoning for a single transfer
- `CompareOriginalAndSimplifiedPlanUseCase` — transfer savings comparison
- 16 new tests, 3 doc files (partial-settlements, debt-simplification, settlement-explanations)

#### Track 3 — Multi-Currency Balance Engine (Prompt 51)
- `calculateGroupBalancesByCurrency` — partitions input by currency, returns `CurrencyBalanceResult[]`
- `MemberCurrencyBalance` — extends `MemberBalance` with `currencyCode`, `expenseCount`, `settlementCount`
- `sourceVersion` — 8-char FNV-1a fingerprint for cache invalidation
- `validateBalanceInvariants` — per-currency zero-sum check
- Spec example enforced: £30 owed in GBP + ₹2,000 receivable in INR NEVER combined
- 7 use cases: GetGroupBalances, GetMemberBalance, GetBalanceBreakdown, GetGroupCurrencySummaries, GetUnsettledMembers, RecalculateGroupBalances, ValidateBalanceInvariants
- 41 new tests, 1 doc file (balance-engine.md)

#### Track 4 — UPI-Assisted Settlement (Prompt 56)
- `MemberPaymentHandle` entity — masked VPA + encrypted ciphertext + verification status
- VPA validator (`name@bank` format, masking to `jo***@oksbi`)
- UPI deep-link builder (`upi://pay?pa=...&pn=...&am=...&cu=INR`) with INR-only currency gate
- QR-code generator (only the URI is encoded — no metadata, no group data, no access tokens)
- Payment-request sharing (masked VPA in message body, full VPA only inside the UPI URI)
- **Return-to-app handler** — discriminated union with NO `payment_completed` variant (by construction)
- 5 use cases: SaveUpiPaymentHandle, GenerateUpiDeepLink, GenerateUpiQr, SharePaymentRequest, HandleUpiReturn
- 140 new tests, 1 doc file (upi-assisted-payments.md)

#### Track 5 — Confirmation + Disputes (Prompt 57)
- `DisputeSettlementUseCase` — 8-value dispute reason taxonomy
- `ResolveDisputeUseCase` — disputed → completed (accept) or cancelled (reject)
- `CorrectSettlementAmountUseCase` — correction-proposal flow (disputes original, creates corrected draft)
- `RequestMoreInfoUseCase` — no state change, audit entry only
- `MarkDuplicateSettlementUseCase` — convenience wrapper for `duplicate` reason
- `ListPendingConfirmationsUseCase` + `ListDisputedSettlementsUseCase`
- 32 new tests, 2 doc files (settlement-confirmation.md, settlement-disputes.md)

#### Track 6 — Reminders (Prompt 59)
- `SettlementReminder` entity — 6 reminder types, 5 statuses, 4 privacy modes, 6 auto-cancel reasons
- Cool-down logic (24-hour default, configurable per-tuple)
- Quiet-hours logic (wrap-across-midnight: 22:00-07:00)
- Neutral wording + shame-language detection
- 5 use cases: Create, Cancel, List, ReconcileReminderState, GenerateGroupSettlementSummary
- 63 new tests, 1 doc file (settlement-reminders.md)

#### Track 7 — Documentation (Prompt 60)
- All 13 required Phase 6 documentation files authored
- `phase-6-audit.md` — complete acceptance criteria checklist

### Phase 7 — Offline Sync & Reliability (Prompts 61-70)

#### Prompt 61 — Durable Mutation Queue
- Extended `SyncEntityType` with Phase 6 entities (settlement_state_history, settlement_reminder, payment_handle, preference)
- Extended `SyncOperationType` with restore, upload, link, confirm, reverse
- Extended `SyncOperationStatus` with queued, processing, retry_wait, blocked, permanently_failed, cancelled
- `dependencyOperationIds` + `payloadVersion` on SyncOperation
- 6 new SyncRepository methods: listBlocked, areDependenciesMet, markPermanentlyFailed, cancelOperation, compactPendingOperations, listByEntity
- Error classifier (3 categories, 22 error codes): retriable, requires_intervention, permanent
- Operation compaction (3 rules: create+update→create, create+delete→cancel, update+update→update)
- Retry policy (bounded exponential backoff with jitter, server retry-after)
- 41 new tests

#### Prompt 62 — Sync Coordinator
- `SyncCoordinator` with process-level lock, connectivity check, batch processing
- `ConnectivityPort`, `RemoteSyncPort`, `DownloadCursorPort` interfaces
- 10 sync triggers, 7 status values
- Stuck-operation recovery on startup
- 13 new tests

#### Prompts 63-70 — Remaining Phase 7
- Incremental download: SyncCursor, RemoteChange, 6 reconciliation rules, tombstones, permission revocation
- Conflict resolution: 3-way merge, FINANCIAL_FIELDS protection (8 fields never auto-merged), conflict priority
- Attachment sync: 10-state lifecycle, 4 privacy modes, structured-data independence, cloud-path security
- Notifications: 13 categories, 3 privacy levels, 4 delivery types, dedup keys, deep-link builder
- Activity feed: 18 event types, 7 filters, visibility rules, user-facing message generation, redaction
- Data export: CSV escape/build, JSON backup schema v1, restore summary, 4 post-restore invariant checks
- 15 Phase 7 documentation files authored
- 84 new tests

### UI + Infrastructure Wiring
- `ExpoConnectivityPort` — concrete connectivity detection (polls, writes to app-state-store)
- `SupabaseRemoteSyncPort` — concrete remote sync (routes to Supabase tables, classifies PostgreSQL errors)
- `SqliteBalanceQueryPort` — concrete BalanceQueryPort (loads all data for a group in one round trip)
- `NewSettlementScreen` — full settlement recording form (payer/receiver/amount/method/note with design-system components)
- `SettlementConfirmationScreen` — receiver-confirmation with 5 actions (confirm, correct, dispute, request-info, mark-duplicate)
- `SyncStatusScreen` — sync status with pending count, failed operations list, retry buttons
- 42 Maestro E2E flow YAML files (20 Phase 6 + 22 Phase 7)

### Version & Build
- Version: 0.1.0 → 2.0.0
- Test suites: 113 → 141 (+28)
- Tests: 3,562 → 4,124 (+562)
- Source files: 523 → 602 (+79)
- Documentation files: 65 → 83 (+18)
- Maestro flows: 1 → 43 (+42)
- Total new files: ~150+

## [1.0.0] — 2026-07-31

### Phase 1 — Foundation & Architecture (Prompts 1-10)
- Domain-driven design architecture (Domain → Application → Infrastructure → Presentation)
- Money value object (integer minor units, zero floating-point)
- 5 split strategies (equal, exact, percentage, share, itemised)
- Balance engine (per-currency, zero-sum invariant)
- Group + member management with soft-delete
- Audit logging
- SQLite infrastructure with transaction wrapper
- Sync queue foundation
- Guest-first identity model
- Privacy models (local_only, cloud_private, shared_with_group, delete_after_extraction)

### Phase 2 — UI/UX (Prompts 11-20)
- Design system (Button, Card, Text, Stack, Row, Avatar, Badge, etc.)
- Expo Router navigation with route guards
- Home dashboard, groups list, activity feed, settings screens
- Offline banner, sync status indicator, error boundary
- View models (home dashboard, draft review, balance explanation, split preview)
- TanStack Query integration
- Accessibility foundations (labels, focus order, contrast)

### Phase 3 — Authentication & Identity (Prompts 21-30)
- Guest identity (no registration required)
- Email OTP authentication (rate-limited, never logged)
- Google + Apple sign-in (provider subject IDs)
- SecureStorage for sessions (not plain SQLite)
- Guest-to-cloud upgrade (resumable, device-secret retention)
- Group invitations (hashed tokens, expiry, revocation, multi-use)
- Permission matrix (owner, admin, member, viewer)
- Deep link handling for join invitations

### Phase 4 — Expense Management (Prompts 31-40)
- Manual expense creation with multi-payer support
- Itemised expenses (line items, charges, discounts)
- Expense editing, voiding, restoration, deletion
- Expense history with search and filters
- Duplicate detection (fingerprint + hash)
- Attachments with privacy modes
- Category management (custom + default categories)
- Change impact preview

### Phase 5 — OCR & Capture Intelligence (Prompts 41-50)
- Capture pipeline (camera → quality → processing → draft → review)
- Mock OCR provider (provider-agnostic port)
- Receipt extraction (total, date, merchant, line items, charges)
- Payment screenshot detection (evidence only, never auto-confirm)
- Confidence engine (field-level: high, medium, low, unknown)
- Receipt reconciliation (items + charges - discounts = total)
- Expense draft lifecycle (create, correct, reconcile, confirm, discard)
- Privacy enforcer (local_only never uploaded, PII redacted)
- Extraction analytics (anonymized)

### Phase 6 — Settlements & Balances (Prompts 51-60)
- Balance query engine (source records, cache, source-version)
- Settlement state machine (9 statuses: draft → requested → pending_confirmation → completed → failed → cancelled → reversed → deleted → disputed)
- Manual, partial, multi-part settlement recording
- Debt simplification (greedy algorithm, preserves net positions)
- UPI-assisted settlement (deep links, QR, INR-only, VPA masking, no auto-success)
- Settlement confirmation, disputes, evidence
- Settlement reversal (new record, preserves history)
- Settlement reminders (cool-down, quiet hours, auto-cancel)
- Phase 6 review fixes: locale-independent sort, idempotency, URI masking, currency-aware decimals, state-machine check

### Phase 7 — Offline Sync & Reliability (Prompts 61-70)
- Durable offline mutation queue (atomic, compaction, dependency ordering)
- Sync coordinator (locking, backoff, batching, connectivity detection)
- Incremental download (cursor, tombstones, permission revocation, full resync)
- Conflict detection + resolution (3-way merge, financial fields never auto-merge)
- Attachment sync (10-state lifecycle, privacy-aware, resumable uploads)
- Notifications (13 categories, 3 privacy levels, deduplication, deep-link revalidation)
- Activity feed (structured events, not row diffing)
- Data export (CSV RFC 4180, JSON schema-versioned, PDF reports)
- Backup encryption (PBKDF2 + AES-256-GCM)
- Restore (3 modes, duplicate detection, zero-sum verification)
- Analytics (opt-in, 12 PII types excluded, amount bucketing)
- Crash reporting (10 PII categories redacted)
- Database migrations (versioned, transactional, resumable)
- Phase 7 review fix: SyncCoordinator deterministic clock (Date.now → injected clock)

### Phase 8 — Security, Testing & Launch Readiness (Prompts 71-80)
- RLS policies for 28 tables (103 policy statements)
- Threat model (12 threats with mitigations)
- Secret scanner (standalone CLI, CI gate with continue-on-error: false)
- Account deletion (in-app, 30-day recovery, audit preserved)
- Comprehensive testing strategy (property-based financial invariants)
- 23 Maestro E2E flow definitions
- 12 performance targets with benchmarks
- WCAG AA/AAA contrast checker
- 4 build profiles (development, internal, staging, production)
- CI/CD pipeline (11 gates)
- Store metadata + reviewer notes + privacy disclosures
- 7 legal document drafts (privacy policy, terms, retention, etc.)
- Beta program + support system + incident response (9 types)
- Phase 8 review fix: CI secret-scan gate (was placeholder with continue-on-error: true)

### Phase 9 — Post-Launch Operations (Prompts 81-90)
- Production monitoring (9 metrics, alerting, dashboards, health checks)
- User feedback system (6 types, NPS, App Store review prompts with financial-task guard)
- Product analytics (DAU/WAU/MAU, retention, adoption, privacy-safe)
- Growth experiments (A/B testing, 7 financial areas blocked, 5 financial flags blocked)
- OCR improvement (consent manager, anonymized field-level diffs, pattern learning)
- Performance optimisation (18 targets, N+1 detection, memory profiling, balance cache safety)
- Security maintenance (dependency audit, secret rotation, pen test, RLS verification, storage review)
- Customer support (tickets, SLA, knowledge base, status page, data-access guard with audit trail)
- Product roadmap (10 feature candidates, data-driven validation)
- Annual audit

### Phase 10 — Scalability & Platform Expansion (Prompts 91-100)
- Scalability architecture (capacity planning, caching strategy, rate limiting, disaster recovery, horizontal scaling)
- Enterprise features (org workspaces, departments, cost centres, expense policies, approvals, spending limits, permissions)
- International expansion (21 locales, locale-aware formatting, 16 regional configs, 19 OCR languages, timezone handling, compliance)
- API & developer platform (OAuth 2.0, webhooks, API keys, versioning, privacy-safe analytics)
- Business intelligence (revenue, growth funnel, infrastructure costs, product health)
- AI evolution (advisory-only, explainable, auditable — 4 TypeScript-literal invariants)
- Compliance & governance (SOC 2 / ISO 27001 readiness, access reviews, vendor management, backup validation, data retention jobs)
- Revenue & monetisation (4 plan tiers, 8 financial core features never gated)
- Ecosystem expansion (19 integrations, 5 forbidden data types, accounting export, calendar sync, payment providers)
- Five-year strategic review (tech/product/business roadmaps, risk register, succession plan)
- Phase 10 review fix: data retention jobs model (12 automated job types)

### Bug Fixes (Cross-Phase)
- Invite expiry bug: ValidateInviteUseCase and JoinGroupUseCase now accept injectable `now` parameter
- SyncCoordinator: Date.now() replaced with injected clock() for deterministic testing
- CI secret scan: placeholder replaced with real scanner + blocking gate
- Floating-point guard: confusing assertIntegerInteger alias removed
- Balance cache: version-based invalidation + zero-sum verification on retrieval
- distinctCurrencies: locale-dependent sort replaced with plain ASCII compare
- RecordSettlementUseCase: idempotency check for clientSettlementId retries
- HandleUpiReturnUseCase: screenshot URI masked in audit note
- formatAmount: currency-aware decimal places (JPY=0, KWD=3)
- ResolveSettlementConflictUseCase: state-machine check for keep_local
