# BillLens — Implementation Blockers

> **No active blockers as of 2026-10-11**

## Resolved Issues

### 2. Balance Engine Ignored Settlement Lifecycle Status (Resolved 2026-10-11, v2.1.0)

- **Issue**: `calculateGroupBalances` counted EVERY non-deleted settlement regardless of lifecycle status. A `pending_confirmation` settlement (not yet receiver-confirmed) already moved balances, a `disputed` settlement kept moving them, and a reversal double-counted against its own reversal record — corrupting the ledger despite the `contributesToCompletedBalance` contract existing in the state machine (it was never wired into the engine; no test covered the interaction).
- **Resolution**: The engine's settlement loop now excludes draft / requested / pending_confirmation / failed / cancelled / disputed settlements, and implements the reversal-PAIR rule — a `reversed` original counts TOGETHER with its `completed` reversal record (swapped from/to), so the pair nets to zero and reversing restores exact previous balances. Excluding the reversed original while counting its reversal would INVERT the payment; the docs (`settlement-reversals.md` §5, `settlement-lifecycle.md`) were corrected to the mathematically coherent semantics.
- **Files modified**: `src/domain/services/balances/balance-engine.ts`, `src/domain/services/settlements/settlement-state-machine.ts` (contract comment), `src/domain/services/balances/__tests__/balance-engine.test.ts` (+5 regression tests), `docs/settlement-reversals.md`, `docs/settlement-lifecycle.md`

### 1. Invite Expiry Date Bug (Resolved)

- **Issue**: `ValidateInviteUseCase` and `JoinGroupUseCase` used `nowDateTime()` (real date) for invite expiry checks instead of an injectable `now` parameter. This caused 12 test failures when the real date passed the invite's expiry date.
- **Resolution**: Added optional `now` parameter to both `ValidateInviteInput` and `JoinGroupInput`. Updated tests to pass `now: NOW`.
- **Files modified**: `validate-invite.usecase.ts`, `join-group.usecase.ts`, `invitations.usecases.test.ts`, `join-group.usecase.test.ts`

## Deferred Items (Not Blockers)

These items are deferred to post-launch or Phase 11+ and do not block the current delivery:

1. **Production Supabase adapters for identity / deletion** — Repository ports are defined; the settlements / audit / expense / group / member / draft / metric adapters now exist as SQLite write-side implementations (v2.0.3 + v2.1.0). The remaining cloud adapters (GuestIdentityRepository, UserIdentityRepository, AccountDeletionRepository, AuthenticationProvider) need the provisioned Supabase project.
2. **Runtime telemetry instrumentation** — `RecordMetricUseCase` + `SqliteMetricRepository` + the dashboard are implemented; wiring real feeds (crash reporter, sync outcome aggregation, OCR accuracy correction stats) requires the live services they measure.
3. **Physical-device E2E testing** — 46 Maestro E2E flows are defined as YAML; execution requires physical iOS + Android devices.
4. **Real OCR provider** — Mock OCR is used for testing; real provider (Google Vision / Azure) integration requires API keys + billing.
5. **App Store / Play Store submission** — All metadata, privacy disclosures, and reviewer notes are prepared; submission requires developer accounts.
6. **Legal review** — 7 legal document drafts are prepared; formal legal review requires a qualified attorney.
7. **SOC 2 / ISO 27001 audit** — Architecture is designed for compliance readiness; formal audit requires an external auditor + production deployment.
