# BillLens — Settlement Lifecycle

> Status: **Phase 6 · Track 1 — Settlement state machine implemented.**
> Companion document: [`settlement-domain.md`](./settlement-domain.md) for the entity model, fields, and invariants.

## 1. Overview

BillLens settlements follow an explicit 8-state lifecycle. Every transition is whitelisted; any transition not on the whitelist throws `InvalidStateTransitionError`. The state machine is the keystone of the Phase 6 safety principle: "BillLens must never claim 'Payment completed' only because a UPI deep link was opened, a QR code was displayed, a payment screenshot was attached, the user left BillLens and returned, or a payment reference was manually entered."

Without an explicit state machine, the balance engine cannot honour "Pending settlements do not affect completed balances" — it has no way to distinguish a pending settlement from a completed one. With it, the rule is enforced by construction through the `contributesToCompletedBalance(status)` contract: only `completed` contributes; every other status is excluded.

## 2. The eight states

| State | Description | Contributes to balance? | Terminal? |
|---|---|---|---|
| `draft` | Created but not yet sent or recorded. | No | No |
| `requested` | Payer has asked the receiver to settle. | No | No |
| `pending_confirmation` | Payer has recorded a payment; awaiting receiver confirmation. | No | No |
| `completed` | Receiver has confirmed (or self-cash with explicit policy). | **Yes** | No (can be reversed) |
| `failed` | Receiver rejected. Can be retried from draft. | No | No |
| `cancelled` | Abandoned by either party. | No | **Yes** |
| `disputed` | Receiver disputes; awaiting resolution. | No | No |
| `reversed` | Completed settlement undone via new reversal record. | No | **Yes** |

Note: the ninth state, **deleted**, is encoded as a soft-delete flag on the entity (`deletedAt`), NOT as a status value. The state machine deals with eight status values; the soft-delete is a separate binary flag managed by `softDeleteSettlement`. A soft-deleted settlement can be in any status, but no further transitions are allowed once `deletedAt` is set.

## 3. The thirteen transitions

The eleven transitions defined by Phase 6 Prompt 52, plus two additional dispute-resolution paths from Prompt 57:

```
draft → requested                  (payer requests settlement)
draft → pending_confirmation       (payer records payment directly)
draft → completed                   (self-cash with explicit policy)

requested → pending_confirmation    (payer pays after requesting)
requested → cancelled               (either party cancels request)

pending_confirmation → completed    (receiver confirms)
pending_confirmation → failed       (receiver rejects)
pending_confirmation → cancelled    (either party cancels)
pending_confirmation → disputed     (receiver disputes)

completed → reversed                (correction via reversal record)
failed → draft                      (retry from draft)

disputed → completed                (dispute resolved, payment accepted)
disputed → cancelled                (dispute resolved, payment rejected)
```

Total: 13 valid transitions.

### 3.1 Forbidden transitions

The state machine rejects the following (and any other transition not on the whitelist above):

- `reversed → completed` — a reversed settlement cannot be re-completed. Create a new settlement instead.
- `cancelled → completed` — a cancelled settlement is terminal. Create a new settlement instead.
- `deleted → pending_confirmation` — soft-deleted settlements cannot transition.
- `draft → disputed` — disputes can only be opened from `pending_confirmation`.
- `requested → completed` — the receiver must confirm; the payer cannot self-complete after requesting.
- `requested → failed` — failure is only meaningful after a payment was recorded (i.e. from `pending_confirmation`).
- `failed → completed` — a failed settlement must retry through `draft` first.
- `failed → pending_confirmation` — same — retry through `draft` first.
- Any self-transition (`draft → draft`, `completed → completed`, etc.).

## 4. Terminal states

`cancelled` and `reversed` are terminal — no transitions out (except soft-delete, which is not a status change). The `isTerminalStatus(status)` predicate returns true for these two.

`completed` is **not** terminal because a completed settlement can still be reversed (correction flow). `disputed` is not terminal because disputes can be resolved into `completed` or `cancelled`.

## 5. The state diagram

```
                                ┌──────────────────┐
                                │      draft        │
                                └─────┬──────┬──────┘
                                      │      │
                          request     │      │ record
                          ┌───────────┘      └────────────┐
                          ▼                               ▼
                  ┌───────────────┐         ┌──────────────────────────┐
                  │   requested   │────────▶│ pending_confirmation     │
                  └──────┬────────┘         │  (awaiting receiver)     │
                         │                  └──┬──────┬──────┬──────┬───┘
                  cancel │                     │      │      │      │
                         ▼              confirm│   fail│  cancel│ dispute│
                  ┌───────────────┐           │      │      │      │
                  │   cancelled   │           ▼      ▼      ▼      ▼
                  └───────────────┘    ┌─────────┐ ┌──────┐ ┌──────┐ ┌─────────┐
                                       │completed│ │failed│ │cance-│ │disputed │
                                       └────┬────┘ └───┬──┘ │lled │ └────┬────┘
                                            │          │    └──────┘      │
                                            │ reverse  │ retry            │ resolve
                                            ▼          └───▶ draft         ▼
                                       ┌─────────┐                   ┌───────────────┐
                                       │reversed │                   │ completed  /  │
                                       └─────────┘                   │  cancelled    │
                                                                     └───────────────┘
```

Notes on the diagram:
- A reversal creates a **new** settlement record (with swapped from/to and the same amount) that is itself `completed`. The original transitions `completed → reversed` and gets `reversesSettlementId` pointing to the new reversal record.
- The `disputed → completed` resolution requires a `confirmedByMemberId` (the receiver) — the dispute cannot be silently closed.
- `failed → draft` is the retry path. After retry, the draft can again go through the full lifecycle.

## 6. The balance-engine contract

The state machine exports `contributesToCompletedBalance(status)` — the contract surface between the state machine and the balance engine.

| Status | Contributes to balance? | Rationale |
|---|---|---|
| `completed` | **Yes** | The receiver confirmed; the payment is real. |
| `pending_confirmation` | No | The receiver has not yet confirmed; the spec says pending settlements do not affect completed balances. |
| `requested` | No | No payment has been recorded; nothing to count. |
| `draft` | No | Same — no payment yet. |
| `disputed` | No | The dispute is unresolved; counting would be premature. |
| `failed` | No | The receiver rejected; the payment is not real. |
| `cancelled` | No | The settlement was abandoned; nothing happened. |
| `reversed` | Yes (pair rule) | Counted TOGETHER with its reversal record (a separate `completed` settlement with swapped from/to) — the pair nets to zero. Excluding the original while counting the reversal would invert the payment. |

The balance engine is the consumer of this contract. Any change to the function requires a corresponding change in `calculateGroupBalances` (see `src/domain/services/balances/balance-engine.ts`).

The state machine also exports `isPendingStatus(status)` — used by the UI to display a separate "pending impact" section (the spec says the UI MAY display pending impact separately, distinct from the completed balance). `pending_confirmation` and `requested` are the two pending statuses.

## 7. Use case to transition mapping

Each transition is exposed by a dedicated use case in `src/application/settlements/`. The mapping:

| Transition | Use case |
|---|---|
| `draft → requested` | `RequestSettlementUseCase` |
| `draft → pending_confirmation` | `RecordSettlementUseCase` |
| `draft → completed` | (deferred to Track 5 — self-cash with explicit policy UI) |
| `requested → pending_confirmation` | `RecordSettlementUseCase` |
| `requested → cancelled` | `CancelSettlementUseCase` |
| `pending_confirmation → completed` | `ConfirmSettlementUseCase` |
| `pending_confirmation → failed` | `RejectSettlementUseCase` |
| `pending_confirmation → cancelled` | `CancelSettlementUseCase` |
| `pending_confirmation → disputed` | (deferred to Track 5 — `DisputeSettlementUseCase`) |
| `completed → reversed` | `ReverseSettlementUseCase` |
| `failed → draft` | `RetrySettlementAsDraftUseCase` |
| `disputed → completed` | (deferred to Track 5 — `ResolveDisputeUseCase`) |
| `disputed → cancelled` | (deferred to Track 5 — `ResolveDisputeUseCase`) |

The entity factory functions (`requestSettlement`, `recordSettlement`, `confirmSettlement`, `rejectSettlement`, `cancelSettlement`, `disputeSettlement`, `reverseSettlement`, `retrySettlementAsDraft`) all exist on the entity today. Track 5 will add the two remaining use cases (`DisputeSettlementUseCase`, `ResolveDisputeUseCase`) that wrap `disputeSettlement` and `resolveDispute`.

## 8. Audit trail

Every transition produces two audit records:

1. **`settlement_state_history`** — one row per transition, with `from_status`, `to_status`, `actor_id`, `actor_member_id`, `note`, `new_version`, `created_at`. Used by the settlement-detail screen (Prompt 58) to render the "state history" section. Append-only — no update or delete.

2. **`audit_logs`** — one row per transition (a coarse cross-entity audit). The `changeSummary` field records `{ status: { from, to } }`. Used by the audit screen. Append-only — no update or delete.

Both are written by the `applySettlementTransition` helper in `src/application/settlements/_transition-helper.ts`. Individual use cases do not write audit records directly — the helper centralises the audit-bookkeeping so a future change to the audit format happens in one place.

## 9. Optimistic concurrency

Every transition accepts an `expectedVersion` parameter. The entity factory compares this against the current `version`; if they differ, the factory throws `VersionConflictError`. This is the optimistic-concurrency guard: if two devices attempt to transition the same settlement concurrently, the second one to land will see a version mismatch and can prompt the user to refresh and retry.

The use cases pass `expectedVersion` through to the entity factory. They do NOT retry automatically — the spec says "Do not allow unsafe last-write-wins for completed settlement records." Retries must be explicit and visible to the user (the conflict-resolution UI is part of Track 5).

## 10. Soft-delete interaction

Soft-delete (the `deletedAt` field) is orthogonal to the status. A settlement can be soft-deleted from any status; the status is preserved through soft-delete. After soft-delete, no further transitions are allowed — the entity factory throws `DeletedEntityError` on any transition attempt.

The `RestoreSettlementUseCase` undoes a soft-delete by clearing `deletedAt` and bumping the version. The settlement returns to whatever status it had before deletion. The caller is responsible for any status correction after restore (e.g. immediately reversing a restored-but-erroneously-completed settlement via `ReverseSettlementUseCase`).

The spec rule: "Do not hard-delete financial audit records." Soft-delete preserves the row; restore un-deletes it. There is no `hardDelete` method on the repository contract.

## 11. Property-based test invariants

The Phase 6 audit (Prompt 60) requires property-based tests for the following properties:

```
For each currency:
  sum of member balances = 0
```

```
Completing settlement X changes:
  payer balance by +X
  receiver balance by −X
```

```
Reversing completed settlement X restores the exact previous balances.
```

Track 1 lays the foundation for these properties by:
- Defining the `contributesToCompletedBalance` contract (the first property depends on per-currency separation, which is Track 3).
- Implementing the `ConfirmSettlementUseCase` and `ReverseSettlementUseCase` (the second and third properties).
- Recording the `settlement_state_history` audit trail (for forensic verification).

The property-based tests themselves will be authored in Track 7 (docs + E2E), once the multi-currency refactor (Track 3) lands.

## 12. References

- [`settlement-domain.md`](./settlement-domain.md) — the entity model, fields, and invariants.
- `src/domain/services/settlements/settlement-state-machine.ts` — the pure state machine module (the source of truth for the transition table).
- `src/domain/services/settlements/__tests__/settlement-state-machine.test.ts` — 31 tests covering every transition, every invalid transition, terminal-status checks, and the balance-engine contract.
- `src/domain/entities/settlement.ts` — the entity factory and transition functions.
- `src/domain/entities/__tests__/settlement-transitions.test.ts` — 33 tests covering every transition function, version conflicts, deleted-entity guards, and field validation.
- `src/application/settlements/` — the eleven Prompt 52 use cases.
- `src/application/settlements/__tests__/settlement-usecases.test.ts` — 34 tests covering every use case's happy path, error paths, idempotency, and the full lifecycle.
