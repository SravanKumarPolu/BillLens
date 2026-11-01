# BillLens — Settlement Domain

> Status: **Phase 6 · Track 1 — Settlement state machine implemented.**
> Companion document: [`settlement-lifecycle.md`](./settlement-lifecycle.md) for the state-transition table and lifecycle diagrams.

## 1. Overview

The Settlement domain captures money transfers between group members that reduce outstanding balances. A settlement is a **separate financial record** — it does NOT modify any expense. Reversing a settlement creates a new adjustment record rather than mutating financial history, preserving the audit trail.

Settlements are the second pillar of the BillLens financial model (the first being expenses and splits). The balance engine combines both: per-member net balance equals paid-for-expenses minus assigned-share plus completed settlements received minus completed settlements sent.

The Phase 6 specification (Prompts 51–60) defines the full settlement and balance-resolution system. This document covers the domain model, the state machine, the entity invariants, and the use case surface. The lifecycle document covers the transition table in detail.

## 2. The Settlement entity

Located at `src/domain/entities/settlement.ts`. The entity is immutable — every mutation returns a new object with a bumped version. The factory `createSettlement` is the only constructor; the transition functions (`requestSettlement`, `recordSettlement`, `confirmSettlement`, `rejectSettlement`, `cancelSettlement`, `disputeSettlement`, `reverseSettlement`, `retrySettlementAsDraft`) are the only way to change the status.

### 2.1 Fields

```ts
interface Settlement {
  // Identity
  readonly id: SettlementId;
  readonly groupId: GroupId;

  // Parties
  readonly fromMemberId: MemberId;          // payer
  readonly toMemberId: MemberId;           // payee (receiver)

  // Money
  readonly amountMinor: number;             // positive integer minor units
  readonly currencyCode: CurrencyCode;      // e.g. INR, USD, GBP
  readonly method: SettlementMethod;        // cash | upi | bank_transfer | card | wallet | other

  // Dates
  readonly settlementDate: DateTime;
  readonly createdAt: DateTime;
  readonly updatedAt: DateTime;
  readonly deletedAt?: DateTime;            // soft-delete — preserves audit

  // Audit
  readonly createdBy: UserId;
  readonly version: VersionNumber;          // optimistic-concurrency guard

  // Reversal linkage (a reversal is a separate financial record)
  readonly reversesSettlementId?: SettlementId;     // set on the original after a reversal
  readonly reversalOfSettlementId?: SettlementId;   // set on the reversal record itself

  // ── Phase 6 Track 1 additions ──
  readonly status?: SettlementStatus;               // 8-state lifecycle
  readonly confirmedByMemberId?: MemberId;          // who confirmed (the receiver)
  readonly confirmedAt?: DateTime;                  // when confirmation happened
  readonly paymentReferenceHash?: string;           // sha256 (hex) — never store the raw reference
  readonly operationId?: string;                   // client-generated idempotency key for offline creation
  readonly evidenceHash?: string;                   // sha256 (hex) of attached evidence file
  readonly disputeReason?: SettlementDisputeReason; // structured reason, set when status='disputed'
  readonly disputeNote?: string;                    // optional free-text context for a dispute
}
```

### 2.2 Sign convention

- `fromMemberId` is the **payer** (the one settling their debt).
- `toMemberId` is the **payee** (the one receiving the payment).
- `amountMinor` is always **positive**.

A settlement received **reduces** what a creditor is still owed (they've been paid back, so they're owed less). A settlement sent **reduces** what a debtor still owes (they've paid, so they owe less). The balance engine uses this convention directly: `net = paid − share − settlementsReceived + settlementsSent`.

### 2.3 Invariants enforced by the factory

The `createSettlement` factory enforces the following invariants. Violations throw `InvalidEntityError`:

| Invariant | Rule |
|---|---|
| `fromMemberId !== toMemberId` | Payer and receiver must be different members. |
| `amountMinor` is a positive integer | Zero and negative amounts rejected. |
| `amountMinor` is a safe integer | IEEE 754 overflow guard. |
| `status` (if provided) is a valid SettlementStatus | Verified against `ALL_SETTLEMENT_STATUSES`. |
| `paymentReferenceHash` (if provided) is 64-char lowercase hex | sha256 format. |
| `evidenceHash` (if provided) is 64-char lowercase hex | sha256 format. |

### 2.4 Backwards compatibility

The `status` field is **optional** on the entity. Pre-Phase-6 callers (the balance engine, the existing test suite) create settlements without specifying `status`; the factory defaults `status` to `'completed'`. This preserves the pre-Phase-6 behaviour: a freshly created settlement contributes to the balance immediately.

New Phase 6 use cases set `status` explicitly through the dedicated transition functions rather than changing the default. The `CreateSettlementDraftUseCase` sets `status: 'draft'` explicitly.

The `isSettlementCompleted(s)` helper honours this contract: a settlement with no `status` field is treated as `'completed'` for balance-engine purposes.

## 3. The SettlementMethod union

Phase 6 Prompt 52 requires support for six payment methods:

```ts
type SettlementMethod = 'cash' | 'upi' | 'bank_transfer' | 'card' | 'wallet' | 'other';
```

The four pre-existing values (`cash`, `upi`, `bank_transfer`, `other`) are unchanged. Phase 6 Track 1 adds `card` and `wallet`. The extension is purely additive — existing callers continue to use the original four values; new callers may use any of the six.

The Supabase schema migration `202610101500_phase6_track1_settlement_state_machine.sql` extends the `settlement_method` enum with `card` and `wallet` via `alter type ... add value`. The SQLite schema accepts the new values through application-layer validation (the `check` constraint in the local schema still lists only the original four — see the schema migration notes for the rationale).

## 4. The SettlementDisputeReason taxonomy

Phase 6 Prompt 57 requires a structured dispute reason taxonomy. The reasons are deliberately enumerated (not free-text) so the UI can render consistent badges and analytics can aggregate cleanly:

```ts
type SettlementDisputeReason =
  | 'not_received'      // Payment not received
  | 'wrong_amount'      // Wrong amount
  | 'wrong_currency'    // Wrong currency
  | 'wrong_sender'      // Wrong sender
  | 'duplicate'         // Duplicate settlement
  | 'failed'            // Payment failed
  | 'reversed'          // Payment was reversed externally
  | 'other';            // Other (note required)
```

The `disputeSettlement` entity factory requires a reason from this list. The `other` reason requires an accompanying note (`disputeNote`); all other reasons accept an optional note. This is enforced by the entity factory, not by the use case — the domain rule lives with the entity.

## 5. The state machine

Located at `src/domain/services/settlements/settlement-state-machine.ts`. The state machine is a **pure module**: no side effects, no I/O, no React Native / SQLite / Supabase dependencies. It operates on plain strings. This makes it trivially unit-testable and reusable from the entity factory, the use cases, and the sync conflict resolver.

The eight states and thirteen transitions are documented in detail in [`settlement-lifecycle.md`](./settlement-lifecycle.md). The key contract surface is:

- `assertValidTransition(from, to)` — throws `InvalidStateTransitionError` on invalid transitions.
- `isValidTransition(from, to)` — boolean predicate.
- `validNextStatuses(from)` — returns the list of valid next statuses (for UI action rendering).
- `contributesToCompletedBalance(status)` — **the contract between the state machine and the balance engine**. Only `completed` contributes; every other status is excluded.
- `isPendingStatus(status)` — returns true for `pending_confirmation` and `requested` (for the UI's "pending impact" section, separate from the completed balance).

The `contributesToCompletedBalance` function is the keystone of the Phase 6 safety principle. The spec says: "Pending settlements do not affect completed balances." Without an explicit state machine and this contract, the balance engine cannot honour that rule — it has no way to distinguish a pending settlement from a completed one. With it, the rule is enforced by construction.

## 6. The repository contract

Located at `src/domain/repositories/settlement.repository.ts`. Phase 6 Track 1 extends the contract with:

- `listByFilter(groupId, filter, pagination)` — backs the settlement history screen's filter UI (Prompt 58) and the pending-confirmation / disputed dashboards.
- `listPendingConfirmation(groupId, pagination)` — convenience wrapper for the pending-confirmation inbox.
- `listDisputed(groupId, pagination)` — convenience wrapper for the dispute-resolution queue.
- `findByOperationId(operationId)` — idempotency check for offline settlement creation (Prompt 53).
- `findByPaymentReferenceHash(groupId, hash)` — duplicate-reference detection (Prompt 53).
- `appendStateHistory(settlementId, transition)` — append-only audit trail of state transitions (Prompt 58).
- `listStateHistory(settlementId)` — read the state-history entries for the settlement-detail screen.

All methods are additive — the existing `findById`, `listByGroup`, `save`, `softDelete`, `saveReversal` are unchanged. Concrete implementations (SQLite, Supabase) need to add the new methods; the in-memory test double in `src/application/settlements/__tests__/_in-memory-repositories.ts` is the reference implementation for tests.

## 7. Use case surface

Phase 6 Prompt 52 requires eleven use cases. Track 1 implements all eleven in `src/application/settlements/`:

| Use case | Transition | File |
|---|---|---|
| `CreateSettlementDraftUseCase` | (creates draft) | `create-settlement-draft.usecase.ts` |
| `RequestSettlementUseCase` | `draft → requested` | `request-settlement.usecase.ts` |
| `RecordSettlementUseCase` | `draft\|requested → pending_confirmation` | `record-settlement.usecase.ts` |
| `ConfirmSettlementUseCase` | `pending_confirmation → completed` | `confirm-settlement.usecase.ts` |
| `RejectSettlementUseCase` | `pending_confirmation → failed` | `reject-settlement.usecase.ts` |
| `CancelSettlementUseCase` | `requested\|pending_confirmation → cancelled` | `cancel-settlement.usecase.ts` |
| `ReverseSettlementUseCase` | `completed → reversed` (+ new reversal record) | `reverse-settlement.usecase.ts` |
| `DeleteSettlementUseCase` | soft-delete (any state) | `delete-settlement.usecase.ts` |
| `RestoreSettlementUseCase` | undo soft-delete | `restore-settlement.usecase.ts` |
| `RetrySettlementAsDraftUseCase` | `failed → draft` | `retry-settlement-as-draft.usecase.ts` |
| `GetSettlementUseCase` | (read) | `get-settlement.usecase.ts` |
| `ListSettlementsUseCase` | (read) | `list-settlements.usecase.ts` |

Each transition use case follows the same five-step pattern, centralised in `_transition-helper.ts`:

1. Load the settlement (or throw `InvalidEntityError`).
2. Apply the transition via the entity factory function (which validates the state machine and bumps the version).
3. Persist the updated settlement via `settlementRepo.save`.
4. Append an entry to the `settlement_state_history` table.
5. Append a coarse `audit_logs` entry.

The audit trail is double-booked: `settlement_state_history` is the per-settlement per-transition trail (used by the settlement-detail screen), and `audit_logs` is the cross-entity audit log (used by the audit screen). Both are append-only — no update or delete methods on either repository.

## 8. Schema

Phase 6 Track 1 adds the following schema changes (see `supabase/migrations/202610101500_phase6_track1_settlement_state_machine.sql` for Supabase, `MIGRATION_0002_PHASE6_TRACK1` in `src/infrastructure/sqlite/schema.ts` for SQLite):

### 8.1 Additive columns on `settlements`

| Column | Type | Notes |
|---|---|---|
| `status` | settlement_status enum (Supabase) / text with check (SQLite) | Nullable; NULL treated as `'completed'` by the domain. |
| `confirmed_by_member_id` | uuid / text | Nullable; references group_members. |
| `confirmed_at` | timestamptz / text | Nullable. |
| `payment_reference_hash` | text | Nullable; 64-char lowercase hex sha256. Unique per (group_id, hash) via partial index. |
| `operation_id` | text | Nullable; client-generated idempotency key. Unique via partial index. |
| `evidence_hash` | text | Nullable; 64-char lowercase hex sha256. |
| `dispute_reason` | text | Nullable; check constraint enforces the 8-value taxonomy. |
| `dispute_note` | text | Nullable; max 2000 chars. |

### 8.2 New tables

| Table | Purpose |
|---|---|
| `settlement_state_history` | Append-only audit trail of state transitions (Prompt 58). |
| `settlement_reminders` | Respectful payment follow-up reminders (Prompt 59). |
| `member_payment_handles` | UPI VPA / bank handles — masked + encrypted (Prompt 56). |

### 8.3 Migration principles

1. **Additive only** — no existing column is renamed, retyped, or removed. No existing row is invalidated.
2. **Nullable** — all new columns are nullable so existing rows hydrate cleanly.
3. **Backfill** — `status` is backfilled to `'completed'` for existing rows so the balance engine continues to count them as before.
4. **Idempotent** — all statements use `if not exists` / `add if not exists`. Re-running the migration is a no-op.
5. **Rollback script provided** — the bottom of the Supabase migration file documents the rollback commands.

## 9. What is NOT in scope for Track 1

Track 1 is the foundation — the state machine, the schema, and the use cases. The following are deferred to later tracks (see the Phase 6 audit report, Section 14, for the full roadmap):

- **Track 2** (use cases for Prompts 51, 53, 55, 59) — the balance-query use cases, the partial-settlement use cases, the explanation use cases, and the reminder use cases.
- **Track 3** (multi-currency refactor) — the balance engine is currently single-currency; Track 3 refactors it to return per-currency balance summaries.
- **Track 4** (UPI) — the `MemberPaymentHandle` entity, the UPI deep-link builder, the QR generator, the INR-only gate, and the return-to-app handler.
- **Track 5** (confirmation + disputes UI) — the receiver confirmation screen, the dispute reason taxonomy UI, the correction-proposal flow. The domain model is in place from Track 1; Track 5 builds the UI on top.
- **Track 6** (reminders) — the `SettlementReminder` entity (table created in Track 1), the five use cases, the cool-down and quiet-hours logic.
- **Track 7** (docs + E2E) — the remaining 11 doc files and the 18 settlement Maestro flows.

## 10. References

- [Phase 6 specification — Prompts 51–60](../UPLOAD_NOTES.md) — the source of truth for the requirements.
- [`settlement-lifecycle.md`](./settlement-lifecycle.md) — companion document covering the state-transition table and lifecycle diagrams.
- `src/domain/services/settlements/settlement-state-machine.ts` — the pure state machine module.
- `src/domain/entities/settlement.ts` — the entity with factory and transition functions.
- `src/application/settlements/` — the eleven Prompt 52 use cases.
- `src/infrastructure/sqlite/schema.ts` — `MIGRATION_0002_PHASE6_TRACK1` for the SQLite migration.
- `supabase/migrations/202610101500_phase6_track1_settlement_state_machine.sql` — the Supabase migration.
